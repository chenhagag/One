/**
 * RAG (Retrieval-Augmented Generation) module for One's love agent.
 *
 * Three context sources:
 *   1. One Knowledge RAG — product rules, models, flows (scope = 'system')
 *   2. User Memory RAG  — summaries, insights, preferences (scope = 'user', scoped by user_id)
 *   3. Live State        — current DB state (not RAG, see getAgentSafeLiveState)
 *
 * Uses pgvector for semantic search with OpenAI text-embedding-3-small.
 */

import OpenAI from "openai";
import { getPool } from "./db.pg";

// ── Embedding ──────────────────────────────────────────────────────

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

/**
 * Generate an embedding vector for the given text.
 * Returns a number[] of length EMBEDDING_DIMENSIONS.
 */
export async function embedText(text: string): Promise<number[]> {
  const resp = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000), // text-embedding-3-small max ~8k tokens
  });
  return resp.data[0].embedding;
}

// ── Search ─────────────────────────────────────────────────────────

export interface ChunkResult {
  id: number;
  scope: "system" | "user";
  category: string;
  title: string;
  content: string;
  source_type: string;
  similarity: number;
}

/**
 * Search for relevant chunks using cosine similarity.
 *
 * @param queryEmbedding  Precomputed embedding of the search query
 * @param scope           'system' for One knowledge, 'user' for user memory
 * @param userId          Required when scope='user' — enforces strict scoping
 * @param limit           Max results to return (default 3)
 * @param threshold       Minimum similarity score (default 0.75)
 */
export async function searchChunks(
  queryEmbedding: number[],
  scope: "system" | "user",
  userId: number | null = null,
  limit: number = 3,
  threshold: number = 0.75
): Promise<ChunkResult[]> {
  const pool = getPool();

  // Format embedding as pgvector literal: '[0.1,0.2,...]'
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  let sql: string;
  let params: any[];

  if (scope === "user") {
    if (userId === null) throw new Error("userId required for user-scoped search");
    // CRITICAL: always filter by user_id to prevent cross-user leaks
    sql = `
      SELECT id, scope, category, title, content, source_type,
             1 - (embedding <=> $1::vector) AS similarity
      FROM knowledge_chunks
      WHERE scope = 'user'
        AND user_id = $2
        AND active = TRUE
        AND 1 - (embedding <=> $1::vector) >= $3
      ORDER BY embedding <=> $1::vector
      LIMIT $4
    `;
    params = [vectorLiteral, userId, threshold, limit];
  } else {
    sql = `
      SELECT id, scope, category, title, content, source_type,
             1 - (embedding <=> $1::vector) AS similarity
      FROM knowledge_chunks
      WHERE scope = 'system'
        AND active = TRUE
        AND 1 - (embedding <=> $1::vector) >= $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `;
    params = [vectorLiteral, threshold, limit];
  }

  const res = await pool.query<ChunkResult>(sql, params);
  return res.rows;
}

// ── Combined retrieval for chat ────────────────────────────────────

export interface RetrievalResult {
  systemChunks: ChunkResult[];
  userChunks: ChunkResult[];
}

/**
 * Run parallel retrieval for both system knowledge and user memory.
 * This is the main function called from chatManager on every user-facing turn.
 *
 * @param queryText     Combined text for embedding (lastAssistantMsg + userMsg)
 * @param userId        Current user's ID
 * @param options       Override limits and thresholds
 */
export async function retrieveContext(
  queryText: string,
  userId: number,
  options?: {
    systemLimit?: number;
    userLimit?: number;
    systemThreshold?: number;
    userThreshold?: number;
  }
): Promise<RetrievalResult> {
  const {
    systemLimit = 3,
    userLimit = 2,
    systemThreshold = 0.72,
    userThreshold = 0.72,
  } = options || {};

  // Single embedding call for both searches
  const queryEmbedding = await embedText(queryText);

  // Parallel search — system + user
  const [systemChunks, userChunks] = await Promise.all([
    searchChunks(queryEmbedding, "system", null, systemLimit, systemThreshold),
    searchChunks(queryEmbedding, "user", userId, userLimit, userThreshold),
  ]);

  return { systemChunks, userChunks };
}

/**
 * Format retrieved chunks into a prompt injection block.
 * Returns empty string if no chunks were retrieved.
 */
export function formatRetrievedContext(result: RetrievalResult): string {
  const parts: string[] = [];

  if (result.systemChunks.length > 0) {
    const items = result.systemChunks
      .map((c) => c.content.trim())
      .join("\n\n");
    parts.push(`[ידע רלוונטי על One — השתמש כשרלוונטי בתשובתך]\n${items}`);
  }

  if (result.userChunks.length > 0) {
    const items = result.userChunks
      .map((c) => {
        const label = c.source_type === "user_statement" ? "המשתמש שיתף" :
                      c.source_type === "one_inference" ? "מסקנת One" :
                      c.source_type === "admin_context" ? "הערת צוות" :
                      "מידע על המשתמש";
        return `(${label}) ${c.content.trim()}`;
      })
      .join("\n\n");
    parts.push(`[מידע רלוונטי על המשתמש]\n${items}`);
  }

  return parts.length > 0 ? "\n\n" + parts.join("\n\n") : "";
}

/**
 * Format retrieval debug info for logging/admin.
 */
export function formatRetrievalDebug(result: RetrievalResult): string {
  const lines: string[] = ["[RAG Retrieval]"];

  if (result.systemChunks.length > 0) {
    lines.push("  One Knowledge:");
    for (const c of result.systemChunks) {
      lines.push(`    - ${c.title} (${c.similarity.toFixed(3)})`);
    }
  } else {
    lines.push("  One Knowledge: (none above threshold)");
  }

  if (result.userChunks.length > 0) {
    lines.push("  User Memory:");
    for (const c of result.userChunks) {
      lines.push(`    - ${c.title} (${c.similarity.toFixed(3)})`);
    }
  } else {
    lines.push("  User Memory: (none above threshold)");
  }

  return lines.join("\n");
}

// ── Chunk management ───────────────────────────────────────────────

/**
 * Insert or update a chunk. Auto-generates embedding from content.
 * For system chunks, pass userId = null.
 * Returns the chunk id.
 */
export async function upsertChunk(params: {
  scope: "system" | "user";
  userId?: number | null;
  category: string;
  title: string;
  content: string;
  sourceType: string;
  version?: number;
}): Promise<number> {
  const {
    scope,
    userId = null,
    category,
    title,
    content,
    sourceType,
    version = 1,
  } = params;

  const embedding = await embedText(content);
  const vectorLiteral = `[${embedding.join(",")}]`;

  const pool = getPool();

  // Upsert by scope + user_id + title (unique combination)
  const res = await pool.query<{ id: number }>(
    `INSERT INTO knowledge_chunks (scope, user_id, category, title, content, embedding, source_type, version, active)
     VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8, TRUE)
     ON CONFLICT (scope, COALESCE(user_id, -1), title)
     DO UPDATE SET content = $5, embedding = $6::vector, source_type = $7, version = $8, active = TRUE, updated_at = NOW()
     RETURNING id`,
    [scope, userId, category, title, content, vectorLiteral, sourceType, version]
  );

  return res.rows[0].id;
}

/**
 * Deactivate a chunk (soft delete).
 */
export async function deactivateChunk(id: number): Promise<void> {
  await getPool().query(
    "UPDATE knowledge_chunks SET active = FALSE, updated_at = NOW() WHERE id = $1",
    [id]
  );
}

// ── Live State (not RAG — direct DB) ───────────────────────────────

export interface AgentSafeLiveState {
  stage: string;            // "לפני מאגר" | "במאגר" | "בהתאמה פעילה"
  channelsCompleted: {
    general: boolean;
    cognitive: boolean;
    taste: boolean;
  };
  photoCount: number;
  daysInSystem: number;
  hasAnalysis: boolean;
  matchesBeingReviewed: boolean;   // potential matches exist
  matchesSelfDeclined: number;     // matches user themselves declined
  hasActiveMatch: boolean;
  waitingForPhotoApproval: boolean;
  profileComplete: boolean;
  agentContext: string | null;     // manual admin notes — always passed through
}

/**
 * Build a safe, sanitized live state block from the DB.
 * Only includes information the agent is allowed to know/use.
 * Deliberately excludes: matches declined by OTHER side, internal scores, admin notes.
 */
export async function getAgentSafeLiveState(userId: number): Promise<AgentSafeLiveState> {
  const pool = getPool();

  // Parallel queries for all live state data
  const [userRow, channelCounts, photoCount, matchInfo] = await Promise.all([
    // User basics
    pool.query<{
      in_matching_pool: boolean;
      auto_analyzed: boolean;
      analysis_completed: boolean;
      has_profile_details: boolean;
      agent_context: string | null;
      created_at: string;
      user_status: string | null;
    }>(
      `SELECT in_matching_pool, auto_analyzed, analysis_completed,
              has_profile_details, agent_context, created_at, user_status
       FROM users WHERE id = $1`,
      [userId]
    ).then(r => r.rows[0]),

    // Channel completion (closing_stage >= 3 = done)
    pool.query<{ guide: string; cnt: string }>(
      `SELECT guide, COUNT(*)::text AS cnt FROM conversation_messages
       WHERE user_id = $1 AND role = 'user' AND guide IN ('new_chat', 'new_chat_cognitive', 'new_chat_taste')
       GROUP BY guide`,
      [userId]
    ).then(r => r.rows),

    // Photo count
    pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM user_photos WHERE user_id = $1`,
      [userId]
    ).then(r => Number(r.rows[0]?.cnt || 0)),

    // Match info — only safe data
    pool.query<{ status: string; cancelled_by: number | null }>(
      `SELECT m.status, m.cancelled_by
       FROM matches m
       WHERE (m.user1_id = $1 OR m.user2_id = $1)
         AND m.status NOT IN ('cancelled')
       ORDER BY m.created_at DESC LIMIT 5`,
      [userId]
    ).then(r => r.rows),
  ]);

  if (!userRow) {
    return {
      stage: "לא נמצא",
      channelsCompleted: { general: false, cognitive: false, taste: false },
      photoCount: 0,
      daysInSystem: 0,
      hasAnalysis: false,
      matchesBeingReviewed: false,
      matchesSelfDeclined: 0,
      hasActiveMatch: false,
      waitingForPhotoApproval: false,
      profileComplete: false,
      agentContext: null,
    };
  }

  // Channel completion — check closing_stage from conversation state
  const generalMsgs = Number(channelCounts.find(c => c.guide === "new_chat")?.cnt || 0);
  const cognitiveMsgs = Number(channelCounts.find(c => c.guide === "new_chat_cognitive")?.cnt || 0);
  const tasteMsgs = Number(channelCounts.find(c => c.guide === "new_chat_taste")?.cnt || 0);

  // Check conversation state for general chat closing
  const convState = await pool.query<{ topic_injection_counts: any }>(
    `SELECT topic_injection_counts FROM user_chat_summaries WHERE user_id = $1`,
    [userId]
  ).then(r => r.rows[0]?.topic_injection_counts);
  const generalClosed = convState?.closing_stage >= 3;

  // Stage determination
  let stage: string;
  if (userRow.user_status === "in_match") {
    stage = "בהתאמה פעילה";
  } else if (userRow.in_matching_pool) {
    stage = "במאגר";
  } else if (generalClosed) {
    stage = "סיים שיחה, לפני מאגר";
  } else if (generalMsgs > 0) {
    stage = "בתהליך שיחה";
  } else {
    stage = "לפני שיחה ראשונה";
  }

  const daysInSystem = Math.floor(
    (Date.now() - new Date(userRow.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Match analysis — only safe info
  const hasActiveMatch = matchInfo.some(m =>
    ["in_match", "waiting_first_rating", "waiting_second_rating"].includes(m.status)
  );
  const matchesBeingReviewed = matchInfo.some(m =>
    ["potential_match", "pre_match", "waiting_for_photo", "waiting_for_response"].includes(m.status)
  );
  const waitingForPhotoApproval = matchInfo.some(m =>
    m.status === "waiting_first_rating" || m.status === "waiting_second_rating"
  );

  // Self-declined matches count
  const selfDeclined = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM matches
     WHERE (user1_id = $1 OR user2_id = $1) AND status = 'cancelled' AND cancelled_by = $1`,
    [userId]
  ).then(r => Number(r.rows[0]?.cnt || 0));

  return {
    stage,
    channelsCompleted: {
      general: generalClosed,
      cognitive: cognitiveMsgs >= 5,
      taste: tasteMsgs >= 5,
    },
    photoCount,
    daysInSystem,
    hasAnalysis: userRow.auto_analyzed || userRow.analysis_completed,
    matchesBeingReviewed,
    matchesSelfDeclined: selfDeclined,
    hasActiveMatch,
    waitingForPhotoApproval,
    profileComplete: userRow.has_profile_details ?? false,
    agentContext: userRow.agent_context,
  };
}

/**
 * Format live state into a compact Hebrew block for prompt injection.
 */
export function formatLiveStateForPrompt(state: AgentSafeLiveState): string {
  const ch = state.channelsCompleted;
  const channels = [
    `כללית ${ch.general ? "✓" : "✗"}`,
    `קוגניטיבית ${ch.cognitive ? "✓" : "✗"}`,
    `טעם ${ch.taste ? "✓" : "✗"}`,
  ].join(" | ");

  const lines = [
    `[סטטוס משתמש — השתמש רק אם נשאלת, אל תציין ביוזמתך]`,
    `שלב: ${state.stage}`,
    `שיחות: ${channels}`,
    `תמונות: ${state.photoCount} | ניתוח: ${state.hasAnalysis ? "הושלם" : "טרם"}`,
    `ימים במערכת: ${state.daysInSystem}`,
  ];

  if (state.hasActiveMatch) lines.push("התאמה פעילה: כן");
  if (state.matchesBeingReviewed) lines.push("התאמות בבדיקה: כן");
  if (state.matchesSelfDeclined > 0) lines.push(`התאמות שפסלת: ${state.matchesSelfDeclined}`);
  if (!state.profileComplete) lines.push("פרטי פתיחה: חסרים");

  return lines.join("\n");
}
