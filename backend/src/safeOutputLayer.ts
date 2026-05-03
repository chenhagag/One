/**
 * Safe Output Layer — returns only data that is safe to share with the user.
 *
 * Currently includes:
 * - Schwartz Values (strong values, score > 60)
 * - Big Five (score > 60, excluding neuroticism)
 * - MBTI type
 *
 * Extensible: add new sections here as they become safe to share.
 */

import { queryAll } from "./db.pg";

interface TraitScore {
  internal_name: string;
  display_name_he: string;
  score: number;
  confidence: number;
}

export interface SafeUserProfile {
  mbti: {
    type: string | null;
    description: string | null;
  };
  values: { name: string; he: string; score: number; description: string }[];
  bigFive: { name: string; he: string; score: number; description: string }[];
}

const MBTI_DESCRIPTIONS: Record<string, string> = {
  ISTJ: "אחראי, יסודי ומסודר. מעדיף מבנה ברור, עובד בשיטתיות ונאמן למחויבויותיו.",
  ISFJ: "אכפתי, מסור ושקט. מונע מרצון לעזור לאחרים, מעדיף יציבות והרמוניה.",
  INFJ: "אידיאליסט עם תובנות עמוקות. מחפש משמעות, מונע מערכים פנימיים חזקים.",
  INTJ: "אסטרטג עצמאי עם חזון. חושב לטווח ארוך, מעדיף יעילות ולוגיקה.",
  ISTP: "פרקטי ושקט, אוהב להבין איך דברים עובדים. גמיש, מגיב היטב ברגע.",
  ISFP: "רגיש ושקט, חי לפי ערכיו. מעריך אסתטיקה, חופש והרמוניה.",
  INFP: "אידיאליסט רגיש עם עולם פנימי עשיר. מחפש אותנטיות ומשמעות.",
  INTP: "חושב אנליטי וסקרן. אוהב לחקור רעיונות, מעדיף לוגיקה ודיוק.",
  ESTP: "אנרגטי ופרקטי, חי ברגע. אוהב פעולה, הרפתקאות ופתרון בעיות מהיר.",
  ESFP: "ספונטני, חברותי ומלא חיים. אוהב להיות במרכז, נהנה מחוויות חדשות.",
  ENFP: "נלהב, יצירתי ואופטימי. רואה אפשרויות בכל מקום, מחבר בין אנשים ורעיונות.",
  ENTP: "ממציא ודיאלקטיקן. אוהב אתגרים אינטלקטואליים, יצירתי ולא קונבנציונלי.",
  ESTJ: "מנהיג מעשי ומאורגן. מעדיף סדר, כללים ברורים ויעילות.",
  ESFJ: "חברותי ואכפתי, מתאמץ למען אחרים. מעריך הרמוניה וקשרים חברתיים.",
  ENFJ: "מנהיג כריזמטי ואמפתי. מעורר השראה, מתמקד באנשים ובפוטנציאל שלהם.",
  ENTJ: "מנהיג החלטי ואסטרטגי. מוביל בביטחון, ממוקד ביעילות ובהישגים.",
};

const VALUE_INFO: Record<string, { he: string; desc: string; relationship: string }> = {
  hedonism: { he: "נהנתנות", desc: "חיפוש הנאה, סיפוק חושים ותענוגות החיים", relationship: "מתאים לבן/בת זוג שאוהבים לבלות, ליהנות ולחוות דברים חדשים יחד" },
  achievement: { he: "הישגיות", desc: "שאיפה להצלחה אישית ומומחיות מקצועית", relationship: "חשוב בן/בת זוג שמבינים את השאפתנות ותומכים בשאיפות" },
  power: { he: "כוח", desc: "חיפוש מעמד, השפעה ושליטה", relationship: "צריך בן/בת זוג שמכבדים את הצורך בהובלה ומעמד" },
  self_direction: { he: "עצמאות", desc: "עצמאות במחשבה ובפעולה, חקירה ויצירה", relationship: "מתאים בן/בת זוג שנותנים מרחב ומכבדים עצמאות" },
  stimulation: { he: "גירוי", desc: "חיפוש התרגשות, חידוש ואתגרים", relationship: "צריך בן/בת זוג שאוהבים ריגושים ולא חוששים מחידושים" },
  security: { he: "ביטחון", desc: "חיפוש יציבות, ביטחון והרמוניה", relationship: "חשוב בן/בת זוג שמספקים תחושת ביטחון ויציבות" },
  conformity: { he: "ציות", desc: "כיבוד כללים, נורמות וציפיות חברתיות", relationship: "מתאים בן/בת זוג עם ערכים חברתיים דומים ומסורתיים" },
  tradition: { he: "מסורת", desc: "כבוד למסורת, מנהגים וערכי העבר", relationship: "חשוב בן/בת זוג עם יחס דומה למסורת ומנהגים" },
  benevolence: { he: "נדיבות", desc: "דאגה לרווחת הקרובים, נאמנות ועזרה", relationship: "מתאים בן/בת זוג עם אכפתיות עמוקה ונכונות לתת" },
  universalism: { he: "אוניברסליות", desc: "הבנה, סובלנות והגנה על כל האנשים והטבע", relationship: "מתאים בן/בת זוג עם ערכים חברתיים רחבים ואמפתיה לעולם" },
  spirituality: { he: "רוחניות", desc: "חיפוש משמעות רוחנית מעבר לחומרי", relationship: "חשוב בן/בת זוג שפתוחים לרוחניות וחיפוש משמעות" },
};

const BIG_FIVE_INFO: Record<string, { he: string; desc: string; relationship: string }> = {
  extraversion: { he: "מוחצנות", desc: "אנרגיה חברתית, חיפוש אינטראקציות, אסרטיביות וחיוניות", relationship: "מתאים בן/בת זוג שאוהבים חברה ופעילות חברתית, או שמאזנים את האנרגיה" },
  conscientiousness: { he: "מצפוניות", desc: "סדר, משמעת עצמית, אחריות ותכנון קדימה", relationship: "חשוב בן/בת זוג שמעריכים אחריות ומחויבות, עם רמת סדר דומה" },
  agreeableness: { he: "נעימות", desc: "אמפתיה, שיתוף פעולה, אמון באנשים ונדיבות", relationship: "מתאים בן/בת זוג שמעריכים הרמוניה, פשרות ורגישות הדדית" },
  openness_to_experience: { he: "פתיחות לחוויות", desc: "סקרנות, יצירתיות, העדפת גיוון ופתיחות לרעיונות חדשים", relationship: "מתאים בן/בת זוג סקרנים שאוהבים לגלות דברים חדשים ולא חוששים משינוי" },
};

function computeMbtiType(traits: Map<string, number>): string | null {
  const ext = traits.get("extraversion");
  const sen = traits.get("sensing");
  const int_ = traits.get("intuition");
  const thi = traits.get("thinking");
  const fee = traits.get("feeling");
  const jud = traits.get("judging");
  const per = traits.get("perceiving");

  if (sen == null && int_ == null && thi == null && fee == null && jud == null && per == null) return null;

  const a1 = ext == null ? "X" : ext > 50 ? "E" : ext < 50 ? "I" : "E";
  const a2 = (sen == null && int_ == null) ? "X" : sen == null ? "N" : int_ == null ? "S" :
    sen > int_ ? "S" : sen < int_ ? "N" : "S";
  const adjT = (thi ?? 0) + 10;
  const a3 = (thi == null && fee == null) ? "X" : thi == null ? "F" : fee == null ? "T" :
    adjT > fee ? "T" : adjT < fee ? "F" : "T";
  const a4 = (jud == null && per == null) ? "X" : jud == null ? "P" : per == null ? "J" :
    jud > per ? "J" : jud < per ? "P" : "J";

  return a1 + a2 + a3 + a4;
}

/**
 * Get safe-to-share profile data for a user.
 */
export async function getSafeUserProfile(userId: number): Promise<SafeUserProfile> {
  const rows = await queryAll<{ internal_name: string; display_name_he: string; score: number; confidence: number }>(
    `SELECT td.internal_name, td.display_name_he, ut.score, ut.confidence
     FROM user_traits ut
     JOIN trait_definitions td ON td.id = ut.trait_definition_id
     WHERE ut.user_id = $1`,
    [userId]
  );

  const traitMap = new Map<string, number>();
  for (const r of rows) {
    if (r.score != null) traitMap.set(r.internal_name, r.score);
  }

  // MBTI
  const mbtiType = computeMbtiType(traitMap);

  // Schwartz values > 60
  const schwartzNames = Object.keys(VALUE_INFO);
  const values = schwartzNames
    .filter(name => (traitMap.get(name) ?? 0) > 60)
    .map(name => ({
      name,
      he: VALUE_INFO[name].he,
      score: traitMap.get(name)!,
      description: VALUE_INFO[name].desc,
    }))
    .sort((a, b) => b.score - a.score);

  // Big Five > 60, excluding neuroticism
  const bigFiveNames = Object.keys(BIG_FIVE_INFO);
  const bigFive = bigFiveNames
    .filter(name => (traitMap.get(name) ?? 0) > 60)
    .map(name => ({
      name,
      he: BIG_FIVE_INFO[name].he,
      score: traitMap.get(name)!,
      description: BIG_FIVE_INFO[name].desc,
    }))
    .sort((a, b) => b.score - a.score);

  return {
    mbti: {
      type: mbtiType,
      description: mbtiType ? (MBTI_DESCRIPTIONS[mbtiType] ?? null) : null,
    },
    values,
    bigFive,
  };
}

/**
 * Format safe profile data as a text block for injection into a prompt.
 */
export function formatSafeProfileForPrompt(profile: SafeUserProfile): string {
  const parts: string[] = [];

  if (profile.mbti.type) {
    parts.push(`טיפוס MBTI: ${profile.mbti.type}`);
    if (profile.mbti.description) parts.push(`  ${profile.mbti.description}`);
  }

  if (profile.values.length > 0) {
    parts.push(`\nערכים מרכזיים (לפי מודל Schwartz):`);
    for (const v of profile.values) {
      const rel = VALUE_INFO[v.name]?.relationship || "";
      parts.push(`  - ${v.he} (${v.score}): ${v.description}. ${rel}`);
    }
  }

  if (profile.bigFive.length > 0) {
    parts.push(`\nתכונות בולטות (לפי מודל Big Five):`);
    for (const t of profile.bigFive) {
      const rel = BIG_FIVE_INFO[t.name]?.relationship || "";
      parts.push(`  - ${t.he} (${t.score}): ${t.description}. ${rel}`);
    }
  }

  return parts.join("\n");
}
