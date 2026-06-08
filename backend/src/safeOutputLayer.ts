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
  neuroticism: { he: "רגישות רגשית", desc: "עוצמת התגובה הרגשית, מודעות פנימית ורגישות לשינויים ולחצים", relationship: "חשוב בן/בת זוג שמבין את הצרכים הרגשיים ויודע לספק ביטחון ורוגע" },
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
// ── Detailed profile for Insights screen ──

export interface DetailedUserProfile {
  mbti: {
    type: string | null;
    description: string | null;
    alternateType: string | null;
    alternateDescription: string | null;
    dimensions: {
      extraversion: number | null;
      sensing: number | null;
      intuition: number | null;
      thinking: number | null;
      feeling: number | null;
      judging: number | null;
      perceiving: number | null;
    };
  };
  allValues: { name: string; he: string; score: number; description: string; relationship: string }[];
  allBigFive: { name: string; he: string; score: number; description: string; relationship: string }[];
}

function computeAlternateMbtiType(traits: Map<string, number>): string | null {
  const ext = traits.get("extraversion");
  const sen = traits.get("sensing");
  const int_ = traits.get("intuition");
  const thi = traits.get("thinking");
  const fee = traits.get("feeling");
  const jud = traits.get("judging");
  const per = traits.get("perceiving");

  // Check if any dimension is borderline (within 5 points of 50 or pair difference <= 10)
  const isBorderline = (a: number | undefined, b: number | undefined, threshold: number) => {
    if (a == null && b == null) return false;
    if (a != null && b == null) return Math.abs(a - 50) <= 5;
    if (a == null && b != null) return Math.abs(b - 50) <= 5;
    return Math.abs(a! - b!) <= 10;
  };

  const eiBorderline = ext != null && Math.abs(ext - 50) <= 5;
  const snBorderline = isBorderline(sen, int_, 10);
  const adjT = (thi ?? 0) + 10;
  const tfBorderline = thi != null && fee != null && Math.abs(adjT - fee) <= 10;
  const jpBorderline = isBorderline(jud, per, 10);

  if (!eiBorderline && !snBorderline && !tfBorderline && !jpBorderline) return null;

  // Flip the most borderline dimension
  const primary = computeMbtiType(traits);
  if (!primary || primary.includes("X")) return null;

  // Try flipping each borderline dimension and return the first alternate
  const flips: [boolean, number, string, string][] = [
    [eiBorderline, 0, "E", "I"],
    [snBorderline, 1, "S", "N"],
    [tfBorderline, 2, "T", "F"],
    [jpBorderline, 3, "J", "P"],
  ];

  for (const [isBorder, idx, a, b] of flips) {
    if (isBorder) {
      const chars = primary.split("");
      chars[idx] = chars[idx] === a ? b : a;
      const alt = chars.join("");
      if (alt !== primary && MBTI_DESCRIPTIONS[alt]) return alt;
    }
  }

  return null;
}

export async function getDetailedUserProfile(userId: number): Promise<DetailedUserProfile> {
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

  const mbtiType = computeMbtiType(traitMap);
  const alternateType = computeAlternateMbtiType(traitMap);

  const schwartzNames = Object.keys(VALUE_INFO);
  const allValues = schwartzNames
    .filter(name => traitMap.has(name))
    .map(name => ({
      name,
      he: VALUE_INFO[name].he,
      score: traitMap.get(name)!,
      description: VALUE_INFO[name].desc,
      relationship: VALUE_INFO[name].relationship,
    }))
    .sort((a, b) => b.score - a.score);

  const bigFiveNames = Object.keys(BIG_FIVE_INFO);
  const allBigFive = bigFiveNames
    .filter(name => traitMap.has(name))
    .map(name => ({
      name,
      he: BIG_FIVE_INFO[name].he,
      score: traitMap.get(name)!,
      description: BIG_FIVE_INFO[name].desc,
      relationship: BIG_FIVE_INFO[name].relationship,
    }))
    .sort((a, b) => b.score - a.score);

  return {
    mbti: {
      type: mbtiType,
      description: mbtiType ? (MBTI_DESCRIPTIONS[mbtiType] ?? null) : null,
      alternateType,
      alternateDescription: alternateType ? (MBTI_DESCRIPTIONS[alternateType] ?? null) : null,
      dimensions: {
        extraversion: traitMap.get("extraversion") ?? null,
        sensing: traitMap.get("sensing") ?? null,
        intuition: traitMap.get("intuition") ?? null,
        thinking: traitMap.get("thinking") ?? null,
        feeling: traitMap.get("feeling") ?? null,
        judging: traitMap.get("judging") ?? null,
        perceiving: traitMap.get("perceiving") ?? null,
      },
    },
    allValues,
    allBigFive,
  };
}

// ── Safe positive traits (beyond Big Five / Values / MBTI) ──
// Only traits that are safe AND positive to share when score is HIGH
const SAFE_POSITIVE_TRAITS: Record<string, string> = {
  analytical_reasoning: "חשיבה אנליטית",
  abstract_thinking: "חשיבה מופשטת",
  cognitive_flexibility: "גמישות קוגניטיבית",
  depth_of_thought: "עומק חשיבה",
  intellectualism: "אינטלקטואליזם",
  verbal_articulation: "ביטוי מילולי",
  verbal_reasoning: "חשיבה מילולית",
  self_awareness: "מודעות עצמית",
  social_intuitive_intelligence: "אינטליגנציה חברתית",
  eq: "אינטליגנציה רגשית",
  positivity: "חיוביות",
  warmth: "חום אנושי",
  charismatic_presence: "נוכחות כריזמטית",
  serious_relationship_intent: "כוונות רציניות לזוגיות",
  loves_animals: "אוהב/ת בעלי חיים",
};

function scoreToLevel(score: number): string {
  if (score >= 80) return "גבוה מאוד";
  if (score >= 65) return "גבוה";
  if (score >= 45) return "בינוני";
  if (score >= 30) return "נמוך";
  return "נמוך מאוד";
}

function mbtiDimensionDescription(dim: string, score: number | null): string {
  if (score == null) return "";
  const balanced = Math.abs(score - 50) <= 8;
  if (balanced) {
    const labels: Record<string, string> = {
      extraversion: "מוחצנות-מופנמות מאוזנת",
      sensing: "חישה-אינטואיציה מאוזנת",
      thinking: "חשיבה-רגש מאוזנים",
      judging: "שיפוט-תפיסה מאוזנים",
    };
    return labels[dim] || "מאוזן";
  }
  const descriptions: Record<string, [string, string]> = {
    extraversion: ["מופנם — שואב אנרגיה מזמן לעצמו", "מוחצן — שואב אנרגיה מאנשים"],
    sensing: ["חושני — מתמקד בפרטים ובמציאות", "אינטואיטיבי — מתמקד בתמונה הגדולה"],
    thinking: ["חושב — מקבל החלטות לוגיות", "מרגיש — מקבל החלטות על בסיס ערכים ורגשות"],
    judging: ["שופט — מעדיף תוכניות וסדר", "תופס — מעדיף גמישות וספונטניות"],
  };
  const pair = descriptions[dim];
  if (!pair) return "";
  return score < 50 ? pair[0] : pair[1];
}

/**
 * Format rich profile for qa_about_me chat — all safe data, descriptive (no raw numbers to user).
 * AI gets scores internally but instructions say to translate to descriptive language.
 */
export async function formatRichProfileForChat(userId: number): Promise<string> {
  const rows = await queryAll<{ internal_name: string; display_name_he: string; score: number; confidence: number }>(
    `SELECT td.internal_name, td.display_name_he, ut.score, ut.confidence
     FROM user_traits ut
     JOIN trait_definitions td ON td.id = ut.trait_definition_id
     WHERE ut.user_id = $1 AND ut.score IS NOT NULL`,
    [userId]
  );

  const traitMap = new Map<string, number>();
  for (const r of rows) traitMap.set(r.internal_name, r.score);

  const parts: string[] = [];

  // MBTI with dimension detail
  const mbtiType = computeMbtiType(traitMap);
  const altType = computeAlternateMbtiType(traitMap);
  if (mbtiType) {
    parts.push(`## MBTI`);
    parts.push(`טיפוס: ${mbtiType} — ${MBTI_DESCRIPTIONS[mbtiType] || ""}`);
    if (altType) parts.push(`טיפוס חלופי אפשרי: ${altType} — ${MBTI_DESCRIPTIONS[altType] || ""}`);
    parts.push(`ממדים:`);
    const dims = [
      ["extraversion", traitMap.get("extraversion")],
      ["sensing", traitMap.get("sensing") != null && traitMap.get("intuition") != null
        ? (traitMap.get("sensing")! > traitMap.get("intuition")! ? traitMap.get("sensing")! : 100 - traitMap.get("intuition")!) : traitMap.get("sensing")],
      ["thinking", traitMap.get("thinking") != null && traitMap.get("feeling") != null
        ? (traitMap.get("thinking")! + 10 > traitMap.get("feeling")! ? traitMap.get("thinking")! : 100 - traitMap.get("feeling")!) : traitMap.get("thinking")],
      ["judging", traitMap.get("judging") != null && traitMap.get("perceiving") != null
        ? (traitMap.get("judging")! > traitMap.get("perceiving")! ? traitMap.get("judging")! : 100 - traitMap.get("perceiving")!) : traitMap.get("judging")],
    ] as [string, number | undefined][];
    for (const [dim, score] of dims) {
      if (score != null) {
        const desc = mbtiDimensionDescription(dim, score);
        if (desc) parts.push(`  - ${desc} (ציון פנימי: ${Math.round(score)})`);
      }
    }
  }

  // Big Five — all 5, with descriptive levels
  parts.push(`\n## Big Five — תכונות אישיות`);
  for (const name of Object.keys(BIG_FIVE_INFO)) {
    const score = traitMap.get(name);
    if (score == null) continue;
    const info = BIG_FIVE_INFO[name];
    const level = scoreToLevel(score);
    parts.push(`  - ${info.he}: ${level} (ציון פנימי: ${Math.round(score)}) — ${info.desc}`);
  }

  // Schwartz — all values
  parts.push(`\n## ערכים (Schwartz)`);
  const sortedValues = Object.keys(VALUE_INFO)
    .filter(name => traitMap.has(name))
    .sort((a, b) => (traitMap.get(b) ?? 0) - (traitMap.get(a) ?? 0));
  for (const name of sortedValues) {
    const score = traitMap.get(name)!;
    const info = VALUE_INFO[name];
    const level = scoreToLevel(score);
    parts.push(`  - ${info.he}: ${level} (ציון פנימי: ${Math.round(score)}) — ${info.desc}`);
  }

  // Safe positive traits — only high scores (>= 65)
  const positiveTraits: string[] = [];
  for (const [name, he] of Object.entries(SAFE_POSITIVE_TRAITS)) {
    const score = traitMap.get(name);
    if (score != null && score >= 65) {
      positiveTraits.push(`  - ${he}: ${scoreToLevel(score)}`);
    }
  }
  if (positiveTraits.length > 0) {
    parts.push(`\n## תכונות בולטות נוספות`);
    parts.push(...positiveTraits);
  }

  return parts.join("\n");
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
