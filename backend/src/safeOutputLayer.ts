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

const ENNEAGRAM_INFO: Record<number, { name: string; desc: string; relationship: string }> = {
  1: { name: "הרפורמיסט", desc: "עקרוני, אידיאליסטי, שואף לשלמות. בעל חוש מוסרי חזק ואחריות גבוהה.", relationship: "מתאים לבן/בת זוג שמעריכים יושרה, סדר ורצון לשפר — אך גם סבלניים כלפי ביקורתיות עצמית" },
  2: { name: "העוזר", desc: "אכפתי, חם ונדיב. ממוקד בצרכים של אחרים ורוצה להרגיש נחוץ.", relationship: "מתאים לבן/בת זוג שמעריכים דאגה ונתינה — ומחזירים תשומת לב ואהבה" },
  3: { name: "ההישגיסט", desc: "שאפתני, יעיל ומוכוון הצלחה. מונע מהישגים והכרה.", relationship: "מתאים לבן/בת זוג שתומכים בשאפתנות ומבינים את הצורך בהצלחה" },
  4: { name: "האינדיבידואליסט", desc: "רגיש, אינטרוספקטיבי וייחודי. מחפש משמעות, עומק וזהות אותנטית.", relationship: "מתאים לבן/בת זוג שמעריכים עומק רגשי, ייחודיות ואותנטיות" },
  5: { name: "החוקר", desc: "סקרן, אנליטי ועצמאי. שואף להבין לעומק ושומר על גבולות.", relationship: "מתאים לבן/בת זוג שמכבדים מרחב אישי וסקרנות אינטלקטואלית" },
  6: { name: "הנאמן", desc: "אחראי, מחויב וערני. מחפש ביטחון, מסגרת ותמיכה.", relationship: "מתאים לבן/בת זוג שמספקים ביטחון, עקביות ונאמנות" },
  7: { name: "ההרפתקן", desc: "אופטימי, ספונטני ותאב חוויות. מחפש הנאה, גיוון וחדשנות.", relationship: "מתאים לבן/בת זוג שאוהבים ריגושים, שמחה ופתיחות לחוויות חדשות" },
  8: { name: "הבוס", desc: "דומיננטי, ישיר ובטוח בעצמו. מגן על חלשים ולא מפחד מעימות.", relationship: "מתאים לבן/בת זוג חזקים שלא נבהלים מעוצמה ומעריכים ישירות" },
  9: { name: "המשכין שלום", desc: "שקט, מפשר ומקבל. מחפש הרמוניה ונמנע מעימותים.", relationship: "מתאים לבן/בת זוג שמעריכים שקט, הרמוניה וסבלנות" },
};

const ATTACHMENT_INFO: Record<string, { he: string; desc: string; relationship: string }> = {
  attachment_secure: { he: "התקשרות בטוחה", desc: "נוח עם קרבה רגשית, סומך על אחרים, מסוגל לתת ולקבל תמיכה", relationship: "יוצר יחסים יציבים, פתוח ונגיש רגשית — מתאים למי שמחפש ביטחון וקרבה" },
  attachment_anxious: { he: "התקשרות חרדתית", desc: "צורך גבוה בוודאות רגשית, חשש מנטישה, רגישות לסימני ריחוק", relationship: "צריך בן/בת זוג שמספקים ביטחון רגשי, עקביות ותקשורת פתוחה" },
  attachment_avoidant: { he: "התקשרות נמנעת", desc: "מעדיף עצמאות, אי-נוחות מקרבה רגשית עמוקה, צורך במרחב", relationship: "צריך בן/בת זוג שמכבדים מרחב אישי ולא לוחצים לקרבה מיידית" },
};

const COMPOUND_ATTACHMENT_DESC: Record<string, { desc: string; relationship: string }> = {
  "בטוח-חרדתי": {
    desc: "ביסודו בטוח ומסוגל ליחסים יציבים, אך נוטה לחרדה ברגעי אי-ודאות — צורך בוידוא שהכל בסדר, רגישות מוגברת לשינויים בזמינות של בן/בת הזוג",
    relationship: "מתפקד היטב בזוגיות יציבה, אך ברגעים של ריחוק או לחץ עולה הצורך בביטחון רגשי. מתאים לבן/בת זוג עקביים שלא נבהלים מצורך בקרבה",
  },
  "בטוח-נמנע": {
    desc: "ביסודו בטוח ומסוגל ליחסים בריאים, אך נוטה לשמור מרחק רגשי ברגעי לחץ — צורך במרחב אישי, לוקח זמן להיפתח עד הסוף",
    relationship: "מסוגל ליחסים עמוקים אך צריך בן/בת זוג שמבינים שהצורך במרחב הוא לא דחייה אלא דרך ההתמודדות שלו. סבלנות ומרחב יביאו לקרבה גדולה יותר",
  },
};

function computeEnneagramType(traitMap: Map<string, number>): { primary: number | null; wing: number | null } {
  let best: { type: number; score: number } | null = null;
  let second: { type: number; score: number } | null = null;

  for (let t = 1; t <= 9; t++) {
    const score = traitMap.get(`enneagram_type_${t}`);
    if (score == null) continue;
    if (!best || score > best.score) {
      second = best;
      best = { type: t, score };
    } else if (!second || score > second.score) {
      second = { type: t, score };
    }
  }

  if (!best) return { primary: null, wing: null };

  // Wing must be an adjacent type (e.g., type 4 can have wing 3 or 5; type 1 can have wing 9 or 2)
  const adj1 = best.type === 1 ? 9 : best.type - 1;
  const adj2 = best.type === 9 ? 1 : best.type + 1;
  const adjScore1 = traitMap.get(`enneagram_type_${adj1}`) ?? 0;
  const adjScore2 = traitMap.get(`enneagram_type_${adj2}`) ?? 0;
  const wing = adjScore1 >= adjScore2 ? adj1 : adj2;

  return { primary: best.type, wing };
}

function computeAttachmentLabel(traitMap: Map<string, number>): { dominant: string | null; label: string | null; labelHe: string | null } {
  const styles = ["attachment_secure", "attachment_anxious", "attachment_avoidant"];
  const scores: { name: string; score: number }[] = [];
  for (const s of styles) {
    const score = traitMap.get(s);
    if (score != null) scores.push({ name: s, score });
  }
  if (scores.length === 0) return { dominant: null, label: null, labelHe: null };

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  const heNames: Record<string, string> = {
    attachment_secure: "בטוח",
    attachment_anxious: "חרדתי",
    attachment_avoidant: "נמנע",
  };

  // If dominant is secure and second style is >= 50, show compound label
  if (best.name === "attachment_secure" && scores.length >= 2 && scores[1].score >= 50) {
    const second = scores[1];
    return {
      dominant: best.name,
      label: `${best.name}+${second.name}`,
      labelHe: `${heNames[best.name]}-${heNames[second.name]}`,
    };
  }

  // Otherwise, just dominant style
  return {
    dominant: best.name,
    label: best.name,
    labelHe: heNames[best.name] ?? null,
  };
}

function computeMbtiType(traits: Map<string, number>): string | null {
  const ext = traits.get("extraversion");
  const sen = traits.get("sensing");
  const int_ = traits.get("intuition");
  const thi = traits.get("thinking");
  const fee = traits.get("feeling");
  const jud = traits.get("judging");
  const per = traits.get("perceiving");

  if (sen == null && int_ == null && thi == null && fee == null && jud == null && per == null) return null;

  // AI tends to inflate extraversion — scores 50-55 are borderline E/I
  const a1 = ext == null ? "X" : ext > 55 ? "E" : ext < 50 ? "I" : "E"; // 50-55 → E but flagged as borderline
  const a2 = (sen == null && int_ == null) ? "X" : sen == null ? "N" : int_ == null ? "S" :
    sen > int_ ? "S" : sen < int_ ? "N" : "S";
  const adjT = (thi ?? 0) + 10;
  const a3 = (thi == null && fee == null) ? "X" : thi == null ? "F" : fee == null ? "T" :
    adjT > fee ? "T" : adjT < fee ? "F" : "T";
  const a4 = (jud == null && per == null) ? "X" : jud == null ? "P" : per == null ? "J" :
    jud > per ? "J" : jud < per ? "P" : "J";

  return a1 + a2 + a3 + a4;
}

/** Returns display label like "ENFP/INFP" when extraversion is 50-55 (borderline E/I) */
function computeMbtiDisplayLabel(traits: Map<string, number>): string | null {
  const type = computeMbtiType(traits);
  if (!type || type.includes("X")) return type;

  const ext = traits.get("extraversion");
  if (ext != null && ext >= 50 && ext <= 55) {
    // Borderline — show both variants
    const flipped = (type[0] === "E" ? "I" : "E") + type.slice(1);
    return `${type}/${flipped}`;
  }
  return type;
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

  const mbtiDisplayLabel = computeMbtiDisplayLabel(traitMap);
  return {
    mbti: {
      type: mbtiDisplayLabel,
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
  enneagram: {
    primaryType: number | null;
    primaryName: string | null;
    wing: number | null;
    typeLabel: string | null;
    description: string | null;
    allTypes: { type: number; name: string; score: number; description: string; relationship: string }[];
  };
  attachment: {
    dominant: string | null;
    dominantHe: string | null;
    description: string | null;
    relationship: string | null;
    styles: { name: string; he: string; score: number; description: string; relationship: string }[];
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

  // Check if any dimension is borderline (pair difference <= 5)
  const isBorderline = (a: number | undefined, b: number | undefined) => {
    if (a == null && b == null) return false;
    if (a != null && b == null) return Math.abs(a - 50) <= 3;
    if (a == null && b != null) return Math.abs(b - 50) <= 3;
    return Math.abs(a! - b!) <= 5;
  };

  // E/I borderline handled separately via computeMbtiDisplayLabel (50-55 range)
  const eiBorderline = false;
  const snBorderline = isBorderline(sen, int_);
  const adjT = (thi ?? 0) + 10;
  const tfBorderline = thi != null && fee != null && Math.abs(adjT - fee) <= 5;
  const jpBorderline = isBorderline(jud, per);

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
  const mbtiDisplayLabel = computeMbtiDisplayLabel(traitMap);
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

  // Enneagram
  const ennea = computeEnneagramType(traitMap);
  const enneagramAllTypes = [];
  for (let t = 1; t <= 9; t++) {
    const score = traitMap.get(`enneagram_type_${t}`);
    if (score == null) continue;
    const info = ENNEAGRAM_INFO[t];
    enneagramAllTypes.push({
      type: t,
      name: info.name,
      score,
      description: info.desc,
      relationship: info.relationship,
    });
  }
  enneagramAllTypes.sort((a, b) => b.score - a.score);

  const enneagramLabel = ennea.primary && ennea.wing
    ? `${ennea.primary}w${ennea.wing}`
    : ennea.primary ? `${ennea.primary}` : null;

  // Attachment
  const attachmentResult = computeAttachmentLabel(traitMap);
  const attachmentStyles = Object.keys(ATTACHMENT_INFO)
    .filter(name => traitMap.has(name))
    .map(name => ({
      name,
      he: ATTACHMENT_INFO[name].he,
      score: traitMap.get(name)!,
      description: ATTACHMENT_INFO[name].desc,
      relationship: ATTACHMENT_INFO[name].relationship,
    }))
    .sort((a, b) => b.score - a.score);

  return {
    mbti: {
      type: mbtiDisplayLabel,
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
    enneagram: {
      primaryType: ennea.primary,
      primaryName: ennea.primary ? ENNEAGRAM_INFO[ennea.primary]?.name ?? null : null,
      wing: ennea.wing,
      typeLabel: enneagramLabel,
      description: ennea.primary ? ENNEAGRAM_INFO[ennea.primary]?.desc ?? null : null,
      allTypes: enneagramAllTypes,
    },
    attachment: {
      dominant: attachmentResult.dominant,
      dominantHe: attachmentResult.labelHe,
      description: attachmentResult.labelHe && COMPOUND_ATTACHMENT_DESC[attachmentResult.labelHe]
        ? COMPOUND_ATTACHMENT_DESC[attachmentResult.labelHe].desc
        : attachmentResult.dominant ? ATTACHMENT_INFO[attachmentResult.dominant]?.desc ?? null : null,
      relationship: attachmentResult.labelHe && COMPOUND_ATTACHMENT_DESC[attachmentResult.labelHe]
        ? COMPOUND_ATTACHMENT_DESC[attachmentResult.labelHe].relationship
        : attachmentResult.dominant ? ATTACHMENT_INFO[attachmentResult.dominant]?.relationship ?? null : null,
      styles: attachmentStyles,
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
  const mbtiLabel = computeMbtiDisplayLabel(traitMap);
  const altType = computeAlternateMbtiType(traitMap);
  if (mbtiType) {
    parts.push(`## MBTI`);
    parts.push(`טיפוס: ${mbtiLabel} — ${MBTI_DESCRIPTIONS[mbtiType] || ""}`);
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

  // Enneagram
  const ennea = computeEnneagramType(traitMap);
  if (ennea.primary) {
    const info = ENNEAGRAM_INFO[ennea.primary];
    parts.push(`\n## אניאגרם`);
    parts.push(`טיפוס ראשי: ${ennea.primary} — ${info?.name || ""}`);
    if (info) parts.push(`  ${info.desc}`);
    if (ennea.wing) {
      const wingInfo = ENNEAGRAM_INFO[ennea.wing];
      parts.push(`כנף: ${ennea.wing} — ${wingInfo?.name || ""}`);
    }
    // Show top 3 types with scores
    const topTypes = [];
    for (let t = 1; t <= 9; t++) {
      const s = traitMap.get(`enneagram_type_${t}`);
      if (s != null) topTypes.push({ t, s });
    }
    topTypes.sort((a, b) => b.s - a.s);
    parts.push(`פיזור:`);
    for (const { t, s } of topTypes.slice(0, 4)) {
      parts.push(`  - טיפוס ${t} (${ENNEAGRAM_INFO[t]?.name || ""}): ${scoreToLevel(s)} (ציון פנימי: ${Math.round(s)})`);
    }
  }

  // Attachment
  const attLabel = computeAttachmentLabel(traitMap);
  if (attLabel.dominant) {
    parts.push(`\n## סגנון התקשרות: ${attLabel.labelHe}`);
    for (const [name, info] of Object.entries(ATTACHMENT_INFO)) {
      const score = traitMap.get(name);
      if (score != null) {
        const marker = name === attLabel.dominant ? " ← דומיננטי" : "";
        parts.push(`  - ${info.he}: ${scoreToLevel(score)} (ציון פנימי: ${Math.round(score)})${marker}`);
      }
    }
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
