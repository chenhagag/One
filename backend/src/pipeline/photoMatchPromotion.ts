/**
 * Photo Match Promotion — promotes matches from waiting_for_photo to potential_match
 * when both users have at least one photo.
 *
 * Called from:
 * 1. Photo upload endpoint (immediate check for the uploading user)
 * 2. Daily reconciliation job (safety net for all waiting_for_photo matches)
 */

import {
  queryOne as pgQueryOne,
  queryAll as pgQueryAll,
} from "../db.pg";
import { logActivity } from "./activityLog";

interface WaitingMatch {
  id: number;
  user1_id: number;
  user2_id: number;
  user1_name: string;
  user2_name: string;
  user1_photos: number;
  user2_photos: number;
}

/**
 * Check all waiting_for_photo matches — promote those where both users have photos.
 * Called daily by jobRunner.
 */
export async function promoteAllWaitingMatches(): Promise<number> {
  const matches = await pgQueryAll<WaitingMatch>(
    `SELECT m.id, m.user1_id, m.user2_id,
       u1.first_name AS user1_name, u2.first_name AS user2_name,
       (SELECT COUNT(*)::int FROM user_photos WHERE user_id = m.user1_id) AS user1_photos,
       (SELECT COUNT(*)::int FROM user_photos WHERE user_id = m.user2_id) AS user2_photos
     FROM matches m
     JOIN users u1 ON u1.id = m.user1_id
     JOIN users u2 ON u2.id = m.user2_id
     WHERE m.status = 'waiting_for_photo'`,
    []
  );

  let promoted = 0;
  for (const match of matches) {
    if (match.user1_photos >= 1 && match.user2_photos >= 1) {
      await promoteMatch(match);
      promoted++;
    }
  }

  if (promoted > 0) {
    console.log(`[photo-promotion] Promoted ${promoted} matches from waiting_for_photo → potential_match`);
  }

  return promoted;
}

/**
 * Check waiting_for_photo matches for a specific user who just uploaded a photo.
 * Called from the photo upload endpoint.
 */
export async function promoteUserWaitingMatches(userId: number): Promise<number> {
  const matches = await pgQueryAll<WaitingMatch>(
    `SELECT m.id, m.user1_id, m.user2_id,
       u1.first_name AS user1_name, u2.first_name AS user2_name,
       (SELECT COUNT(*)::int FROM user_photos WHERE user_id = m.user1_id) AS user1_photos,
       (SELECT COUNT(*)::int FROM user_photos WHERE user_id = m.user2_id) AS user2_photos
     FROM matches m
     JOIN users u1 ON u1.id = m.user1_id
     JOIN users u2 ON u2.id = m.user2_id
     WHERE m.status = 'waiting_for_photo'
       AND (m.user1_id = $1 OR m.user2_id = $1)`,
    [userId]
  );

  let promoted = 0;
  for (const match of matches) {
    if (match.user1_photos >= 1 && match.user2_photos >= 1) {
      await promoteMatch(match);
      promoted++;
    }
  }

  return promoted;
}

async function promoteMatch(match: WaitingMatch): Promise<void> {
  await pgQueryAll(
    "UPDATE matches SET status = 'potential_match', updated_at = NOW() WHERE id = $1",
    [match.id]
  );

  console.log(`[photo-promotion] Match #${match.id}: ${match.user1_name} ↔ ${match.user2_name} → potential_match`);

  await logActivity(
    "photo_promotion",
    null,
    null,
    "waiting_for_photo → potential_match",
    `התאמה #${match.id}: ${match.user1_name} (#${match.user1_id}) ↔ ${match.user2_name} (#${match.user2_id})`
  );
}
