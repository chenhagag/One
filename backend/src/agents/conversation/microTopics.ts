/**
 * Micro-Topics — fine-grained conversation flow management.
 *
 * Each micro-topic has:
 * - openingQuestion: the mandatory first question (always asked)
 * - followUpQuestions: optional questions the AI can use for depth
 * - guideline: short instruction for the AI
 * - minInjections: how many substantive turns before moving on (typically 2)
 */

export interface MicroTopic {
  id: string;
  openingQuestion: string;
  followUpQuestions: string[];
  guideline: string;
  minInjections: number;
}

export const MICRO_TOPICS: MicroTopic[] = [
  {
    id: "general",
    openingQuestion: "איך נראה יום רגיל שלך? במה אתה עוסק?",
    followUpQuestions: [],
    guideline: "היכרות ראשונית קלה. אחרי שיש לך מושג כללי — עבור הלאה.",
    minInjections: 1,
  },
  {
    id: "career_basics",
    openingQuestion: "מה למדת, ואם בא לך לספר — איפה?",
    followUpQuestions: [
      "איך הגעת לתחום שאתה נמצא בו היום — זה היה מתוכנן או שהתגלגל?",
    ],
    guideline: "חשוב לברר גם לימודים וגם איך הגיע לתחום הנוכחי.",
    minInjections: 1,
  },
  {
    id: "career_deep",
    openingQuestion: "אם לא היית צריך לדאוג לכסף בכלל – היית נשאר בתחום שבו אתה עוסק היום או שובר לכיוון אחר לגמרי?",
    followUpQuestions: [
      "אתה מרגיש שהתחום שלך באמת מתאים לך, או שזה יותר משהו שקרה בדרך?",
      "מה אתה אוהב במה שאתה עושה היום, ומה פחות?",
      "אם הייתי שואל אותך בגיל 18 איפה תהיה היום — זה היה דומה למה שקרה בפועל?",
      "יש משהו שאתה עדיין רוצה ללמוד או לעשות בהמשך?",
      "אתה יותר טיפוס של קריירה ושאפתנות, או שהעבודה היא בעיקר בסיס לחיים שמחוץ לעבודה?",
    ],
    guideline: "הרחבה על הקריירה והשאיפות. שאל שאלה אחת.",
    minInjections: 1,
  },
  {
    id: "relationship_past",
    openingQuestion: "תאר/י לי קצת את מערכת היחסים האחרונה שהייתה לך. מה עבד לך ומה לא עבד?",
    followUpQuestions: [
      "אם הייתי שואל את האקס/ית שלך 'מה השיעור הכי גדול שלומדים כשנמצאים איתך בזוגיות' — מה נראה לך שהיו עונים?",
    ],
    guideline: "חשוב להבין את הניסיון הקודם. אם המשתמש אומר שלא הייתה לו מערכת יחסים רצינית — שאל למה לדעתו זה לא קרה.",
    minInjections: 1,
  },
  {
    id: "relationship_patterns",
    openingQuestion: "כשיש ריב בזוגיות — אתה צריך לדבר מיד, או לקחת זמן ולהירגע?",
    followUpQuestions: [
      "בתוך קשר, מה נחשב אצלך 'חנק' ומה נחשב 'הזנחה'? איפה עובר הקו?",
      "בתחילת קשר — אתה מתמסר מהר, בודק בזהירות, או לוקח זמן להבין מה אתה מרגיש?",
      "מה גורם לך להתרחק גם אם יש משיכה?",
      "יש דפוס שחוזר אצלך בקשרים?",
      "יש משהו שאתה יודע שאתה מביא לקשר וצריך שמישהו יידע להכיל?",
    ],
    guideline: "דפוסים בזוגיות. שאל שאלה אחת.",
    minInjections: 1,
  },
  {
    id: "personality_general",
    openingQuestion: "איך אנשים קרובים אליך היו מתארים אותך?",
    followUpQuestions: [
      "מה הדבר שהכי מעצבן אותך שאומרים עליך, למרות שיש בזה גרעין של אמת?",
    ],
    guideline: "תמונה כללית של האישיות מבחוץ.",
    minInjections: 1,
  },
  {
    id: "personality_conflict",
    openingQuestion: "כשיש לך קונפליקט עם מישהו קרוב — איך זה נראה בדרך כלל?",
    followUpQuestions: [
      "אם מישהו ממש מעצבן אותך אבל את/ה חייב/ת להישאר איתו בקשר — איך את/ה מתנהל/ת?",
      "כשמישהו שאתה מאוד אוהב אומר משהו שסותר לגמרי את האמונות שלך — אתה מגיב או שומר על השקט?",
      "חבר/ה טוב/ה עובר/ת תקופה קשה ומתרחק/ת — איך את/ה מתנהג/ת?",
      "חבר עשה טעות שפגעה במישהו — אתה אומר את האמת או תומך קודם?",
    ],
    guideline: "איך מתמודד עם קונפליקטים ומצבים חברתיים מורכבים. שאל שאלה אחת.",
    minInjections: 1,
  },
  {
    id: "family",
    openingQuestion: "ספר/י לי קצת על המשפחה שלך — מה מאפיין אותם? כמה הם שונים ממך / דומים לך?",
    followUpQuestions: [
      "אם המשפחה שלך מאוד לא אוהבת את הבחירה הזוגית שלך — עד כמה זה משפיע עליך?",
    ],
    guideline: "יחסי משפחה והשפעתם.",
    minInjections: 1,
  },
  {
    id: "fun_lifestyle",
    openingQuestion: "איזה ערב נשמע לך הכי כיף: בר עם חברים, הופעה, סרט בבית, מסעדה טובה, מסיבה, או שיחה ארוכה על מרפסת?",
    followUpQuestions: [
      "כמה מקום יש אצלך בחיים לאוכל טוב, חופשות, בילויים ופינוקים?",
      "את/ה יכול/ה לבחור — חיי שגרה יציבים או חיים מלאי שינויים והרפתקאות?",
      "אם יש לך שבת פנויה לגמרי — איך היא נראית?",
      "כשאתה יוצא לחופשה — אתה מחפש מלון נוח, עיר עם תרבות ואוכל, טבע והרפתקאות, או משהו אחר?",
    ],
    guideline: "סגנון חיים, בילויים, העדפות. שאל שאלה אחת.",
    minInjections: 1,
  },
  {
    id: "values_beliefs",
    openingQuestion: "יש דעות פוליטיות, חברתיות או אמונות שבעיניך הן קו אדום בזוגיות?",
    followUpQuestions: [
      "מה את/ה מגדיר/ה כאמונות הכי חזקות שלך?",
      "יש נושא חברתי או פוליטי שאתה מרגיש שממש אכפת לך ממנו, גם אם אתה לא מדבר עליו הרבה?",
      "כשאתה חושב על הילדים שיהיו לך — מה חשוב לך יותר שהם יספגו?",
      "יש דעה שהייתה לך פעם והשתנתה עם השנים?",
      "כשיש ויכוח פוליטי או ערכי בארוחת שישי — אתה נכנס לזה או מעדיף להתרחק?",
      "כמה חשוב לך שבן/בת זוג יחשבו כמוך פוליטית או ערכית?",
      "נניח שחבר טוב שלך מחזיק בדעה פוליטית שממש קשה לך איתה. זה משנה משהו בקשר ביניכם?",
      "אם בן/בת זוג שלך היה/הייתה מצביע/ה הפוך ממך לגמרי — זה היה בעייתי או לא בהכרח?",
    ],
    guideline: "דעות, אמונות, קווים אדומים. שאל שאלה אחת.",
    minInjections: 1,
  },
  {
    id: "values_openness",
    openingQuestion: "מה אתה חושב על אנשים שבוחרים לחיות מאוד אחרת מהמיינסטרים — נגיד בלי ילדים, בקומונה, ברילוקיישן קבוע, או בקריירה לא יציבה?",
    followUpQuestions: [
      "אתה מרגיש יותר מחובר למסורת/דת/משפחתיות, או יותר לחופש אישי ולבחירה עצמאית?",
      "יש משהו שאתה מרגיש שהחברה היום לוקחת רחוק מדי?",
      "ויש משהו שאתה מרגיש שהחברה עדיין לא מתקדמת בו מספיק?",
      "כשאתה שומע אנשים אומרים 'הדור של היום מפונק' — אתה מסכים עם זה או שזה מעצבן אותך?",
    ],
    guideline: "פתיחות, מסורת מול חופש, גישה לחברה. שאל שאלה אחת.",
    minInjections: 1,
  },
  {
    id: "culture",
    openingQuestion: "יש נושא שאת/ה יכול/ה לדבר עליו שעות?",
    followUpQuestions: [
      "אתה אוהב ללמוד דברים סתם מסקרנות, גם אם אין לזה שימוש ברור?",
    ],
    guideline: "עולם תוכן ואינטלקטואליות.",
    minInjections: 1,
  },
  {
    id: "culture_interests",
    openingQuestion: "יש עולם שאתה מרגיש שאתה שייך אליו? הייטק, אמנות, מוזיקה, ספורט, רוחניות, אקדמיה, חיי לילה, משהו אחר?",
    followUpQuestions: [
      "מה הדבר האחרון שראית/קראת/שמעת וממש נשאר איתך?",
    ],
    guideline: "זיהוי 'השבט' של המשתמש.",
    minInjections: 1,
  },
  {
    id: "social",
    openingQuestion: "רוב החברים שלך דומים לך או מגוונים מאוד?",
    followUpQuestions: [
      "אתה מעדיף הרבה חברים ומעגלים, או מעט אנשים מאוד קרובים?",
      "כמה חשוב לך שבן/בת זוג ייכנסו טוב לחבורה שלך?",
      "אתה יותר אוהב אנשים עם סטייל ברור ומיוחד, או אנשים פשוטים ולא מתאמצים?",
    ],
    guideline: "חיי חברה וסגנון חברתי. שאל שאלה אחת.",
    minInjections: 1,
  },
];

/** Build the prompt injection for a specific micro-topic */
export function buildMicroTopicPrompt(topic: MicroTopic, isFirstInjection: boolean): string {
  if (isFirstInjection) {
    // First time — react briefly then transition to the new question
    let prompt = `\n\n## הנחיה לתור הזה\nתגיב בקצרה למה שהמשתמש אמר (משפט אחד-שניים), ואז עבור נושא ושאל:\n"${topic.openingQuestion}"\nהתאם מגדר. שאלה אחת בלבד — אל תוסיף שאלות נוספות.`;
    if (topic.guideline) prompt += `\n${topic.guideline}`;
    return prompt;
  } else {
    // Follow-up turn — deepen or ask from the list
    let prompt = `\n\n## הנחיה לתור הזה\n`;
    if (topic.followUpQuestions.length > 0) {
      prompt += `אם המשתמש הרחיב — מותר שאלת המשך אחת על מה שאמר. אם היה תמציתי — נסה לדובב בשאלה ממוקדת.\nעדיף לבחור שאלה מהרשימה:\n`;
      for (const q of topic.followUpQuestions) {
        prompt += `- "${q}"\n`;
      }
    } else {
      prompt += `אם המשתמש הרחיב — מותר שאלת המשך אחת. אם היה תמציתי — נסה לדובב.\n`;
    }
    prompt += `שאלה אחת בלבד. התאם מגדר.`;
    return prompt;
  }
}

/** State stored in DB */
export interface ConversationState {
  current_topic_index: number;    // which micro-topic we're on (0 to MICRO_TOPICS.length-1)
  turn_in_topic: number;          // 0 = opening question, 1 = follow-up
  closing_stage: number;          // 0=normal, 1=insight, 2=final, 3=done
  off_topic_turns: number;        // consecutive system/meta turns
}

export const DEFAULT_STATE: ConversationState = {
  current_topic_index: 0,
  turn_in_topic: 0,
  closing_stage: 0,
  off_topic_turns: 0,
};

/** Get the current micro-topic, or null if all done */
export function getCurrentTopic(state: ConversationState): MicroTopic | null {
  if (state.current_topic_index >= MICRO_TOPICS.length) return null;
  return MICRO_TOPICS[state.current_topic_index];
}

/** Advance to the next topic */
export function advanceToNextTopic(state: ConversationState): void {
  state.current_topic_index++;
  state.turn_in_topic = 0;
}

/** Check if all topics are done */
export function allTopicsDone(state: ConversationState): boolean {
  return state.current_topic_index >= MICRO_TOPICS.length;
}
