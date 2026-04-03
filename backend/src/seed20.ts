/**
 * Seed Script — 20 additional fictional users
 * =============================================
 * Run: npx ts-node src/seed20.ts
 *
 * Appends 20 new users WITHOUT deleting existing ones.
 * Idempotent: skips users whose email already exists (INSERT OR IGNORE pattern).
 * All seed users use the @matchme-seed2.test email domain.
 */

import db from "./db";

// Check if already seeded
const existing = (db.prepare("SELECT COUNT(*) as c FROM users WHERE email LIKE '%@matchme-seed2.test'").get() as any).c;
if (existing > 0) {
  console.log(`Seed2 data already exists (${existing} users). Removing for clean re-seed...`);
  const ids = (db.prepare("SELECT id FROM users WHERE email LIKE '%@matchme-seed2.test'").all() as { id: number }[]).map(r => r.id);
  db.transaction(() => {
    for (const id of ids) {
      db.prepare("DELETE FROM candidate_matches WHERE user_id = ? OR candidate_user_id = ?").run(id, id);
      db.prepare("DELETE FROM match_scores WHERE match_id IN (SELECT id FROM matches WHERE user1_id = ? OR user2_id = ?)").run(id, id);
      db.prepare("DELETE FROM matches WHERE user1_id = ? OR user2_id = ?").run(id, id);
      db.prepare("DELETE FROM user_traits WHERE user_id = ?").run(id);
      db.prepare("DELETE FROM user_look_traits WHERE user_id = ?").run(id);
      db.prepare("DELETE FROM profiles WHERE user_id = ?").run(id);
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
    }
  })();
}

// ── 20 New Users ────────────────────────────────────────────────

const users = [
  // ---------------------------------------------------------------
  // 1: אביגיל — THE QUIET BOOKWORM
  // Introverted, highly intelligent, loves reading and solitude.
  // Low energy, high analytical. Secular. Moderate selectiveness.
  // ---------------------------------------------------------------
  {
    first_name: "אביגיל", email: "avigail@matchme-seed2.test",
    age: 27, gender: "woman", looking_for_gender: "man",
    city: "ירושלים", height: 163, self_style: ["casual", "natural"],
    desired_age_min: 26, desired_age_max: 34, age_flexibility: "slightly_flexible",
    desired_height_min: 168, desired_height_max: 188, height_flexibility: "slightly_flexible",
    desired_location_range: "bit_further",
    pickiness_score: 45, initial_attraction_signal: 55,
  },
  // ---------------------------------------------------------------
  // 2: איתי — THE TECH BRO
  // Analytical, high-income lifestyle, moderate extrovert.
  // Loves gadgets, data, optimization. Slightly rigid values.
  // ---------------------------------------------------------------
  {
    first_name: "איתי", email: "itay@matchme-seed2.test",
    age: 30, gender: "man", looking_for_gender: "woman",
    city: "תל אביב", height: 180, self_style: ["casual", "groomed"],
    desired_age_min: 24, desired_age_max: 31, age_flexibility: "slightly_flexible",
    desired_height_min: 158, desired_height_max: 175, height_flexibility: "slightly_flexible",
    desired_location_range: "my_area",
    pickiness_score: 55, initial_attraction_signal: 70,
  },
  // ---------------------------------------------------------------
  // 3: הילה — THE SOCIAL BUTTERFLY
  // Maximum extroversion, party-oriented, loves nightlife.
  // Warm but shallow depth. Low selectiveness.
  // ---------------------------------------------------------------
  {
    first_name: "הילה", email: "hila@matchme-seed2.test",
    age: 24, gender: "woman", looking_for_gender: "man",
    city: "תל אביב", height: 167, self_style: ["elegant", "groomed"],
    desired_age_min: 24, desired_age_max: 32, age_flexibility: "very_flexible",
    desired_height_min: 172, desired_height_max: 195, height_flexibility: "very_flexible",
    desired_location_range: "my_area",
    pickiness_score: 20, initial_attraction_signal: 80,
  },
  // ---------------------------------------------------------------
  // 4: עמית — THE RELIGIOUS FAMILY MAN
  // Traditional-religious, high family orientation, moderate intelligence.
  // Values stability and shared faith. Very selective on religiosity.
  // ---------------------------------------------------------------
  {
    first_name: "עמית", email: "amit@matchme-seed2.test",
    age: 32, gender: "man", looking_for_gender: "woman",
    city: "מודיעין", height: 177, self_style: ["casual"],
    desired_age_min: 25, desired_age_max: 32, age_flexibility: "slightly_flexible",
    desired_height_min: 155, desired_height_max: 172, height_flexibility: "very_flexible",
    desired_location_range: "bit_further",
    pickiness_score: 65, initial_attraction_signal: 52,
  },
  // ---------------------------------------------------------------
  // 5: יעל — THE AMBITIOUS LAWYER
  // Sharp, analytical, serious. High cognitive, moderate warmth.
  // Career-first but wants partnership. Moderately selective.
  // ---------------------------------------------------------------
  {
    first_name: "יעל", email: "yael@matchme-seed2.test",
    age: 29, gender: "woman", looking_for_gender: "man",
    city: "רמת גן", height: 170, self_style: ["elegant", "groomed"],
    desired_age_min: 28, desired_age_max: 36, age_flexibility: "slightly_flexible",
    desired_height_min: 174, desired_height_max: 192, height_flexibility: "not_flexible",
    desired_location_range: "my_area",
    pickiness_score: 62, initial_attraction_signal: 72,
  },
  // ---------------------------------------------------------------
  // 6: ניר — THE OUTDOOR ADVENTURER
  // High energy, nature lover, moderate intelligence.
  // Spontaneous, low luxury. Wants active partner. Flexible.
  // ---------------------------------------------------------------
  {
    first_name: "ניר", email: "nir@matchme-seed2.test",
    age: 28, gender: "man", looking_for_gender: "woman",
    city: "חיפה", height: 183, self_style: ["sporty", "natural"],
    desired_age_min: 23, desired_age_max: 30, age_flexibility: "very_flexible",
    desired_height_min: 155, desired_height_max: 178, height_flexibility: "very_flexible",
    desired_location_range: "bit_further",
    pickiness_score: 25, initial_attraction_signal: 62,
  },
  // ---------------------------------------------------------------
  // 7: מאיה — THE YOGA SPIRITUALIST
  // High openness, vegetarian, spiritual but not religious.
  // Calm energy, high self-awareness. Values authenticity.
  // ---------------------------------------------------------------
  {
    first_name: "מאיה", email: "maya@matchme-seed2.test",
    age: 31, gender: "woman", looking_for_gender: "man",
    city: "הרצליה", height: 166, self_style: ["natural", "hipster"],
    desired_age_min: 28, desired_age_max: 38, age_flexibility: "very_flexible",
    desired_height_min: 168, desired_height_max: 190, height_flexibility: "very_flexible",
    desired_location_range: "bit_further",
    pickiness_score: 30, initial_attraction_signal: 58,
  },
  // ---------------------------------------------------------------
  // 8: אלון — THE CLASS CLOWN
  // Very goofy, high humor, moderate intelligence.
  // Life of the party but emotionally available. Low seriousness.
  // ---------------------------------------------------------------
  {
    first_name: "אלון", email: "alon@matchme-seed2.test",
    age: 26, gender: "man", looking_for_gender: "woman",
    city: "תל אביב", height: 175, self_style: ["casual"],
    desired_age_min: 22, desired_age_max: 28, age_flexibility: "slightly_flexible",
    desired_height_min: 155, desired_height_max: 172, height_flexibility: "very_flexible",
    desired_location_range: "my_area",
    pickiness_score: 18, initial_attraction_signal: 68,
  },
  // ---------------------------------------------------------------
  // 9: שי — THE GAY ATHLETE
  // Sporty, disciplined, moderate depth. Wants masculine partner.
  // High energy, groomed. Selective on fitness.
  // ---------------------------------------------------------------
  {
    first_name: "שי", email: "shai@matchme-seed2.test",
    age: 27, gender: "man", looking_for_gender: "man",
    city: "תל אביב", height: 181, self_style: ["sporty", "groomed"],
    desired_age_min: 24, desired_age_max: 34, age_flexibility: "slightly_flexible",
    desired_height_min: 172, desired_height_max: 192, height_flexibility: "slightly_flexible",
    desired_location_range: "my_area",
    pickiness_score: 55, initial_attraction_signal: 75,
  },
  // ---------------------------------------------------------------
  // 10: דנה — THE STARTUP FOUNDER
  // Very high cognitive, driven, blunt. Risk-taker.
  // Low patience for small talk. Values ambition in partner.
  // ---------------------------------------------------------------
  {
    first_name: "דנה", email: "dana@matchme-seed2.test",
    age: 33, gender: "woman", looking_for_gender: "man",
    city: "תל אביב", height: 172, self_style: ["casual", "groomed"],
    desired_age_min: 29, desired_age_max: 40, age_flexibility: "slightly_flexible",
    desired_height_min: 174, desired_height_max: 195, height_flexibility: "slightly_flexible",
    desired_location_range: "my_area",
    pickiness_score: 72, initial_attraction_signal: 65,
  },
  // ---------------------------------------------------------------
  // 11: תומר — THE GENTLE GIANT
  // Tall, warm, introverted. High emotional stability.
  // Quiet strength, loves animals. Very low selectiveness.
  // ---------------------------------------------------------------
  {
    first_name: "תומר", email: "tomer@matchme-seed2.test",
    age: 30, gender: "man", looking_for_gender: "woman",
    city: "רחובות", height: 192, self_style: ["casual", "natural"],
    desired_age_min: 24, desired_age_max: 33, age_flexibility: "very_flexible",
    desired_height_min: 155, desired_height_max: 180, height_flexibility: "very_flexible",
    desired_location_range: "bit_further",
    pickiness_score: 12, initial_attraction_signal: 55,
  },
  // ---------------------------------------------------------------
  // 12: לינוי — THE YOUNG PARTIER
  // Young, high party orientation, low seriousness.
  // Fun-loving, moderate depth. Flexible preferences.
  // ---------------------------------------------------------------
  {
    first_name: "לינוי", email: "linoy@matchme-seed2.test",
    age: 22, gender: "woman", looking_for_gender: "man",
    city: "תל אביב", height: 164, self_style: ["elegant", "groomed"],
    desired_age_min: 22, desired_age_max: 28, age_flexibility: "slightly_flexible",
    desired_height_min: 172, desired_height_max: 190, height_flexibility: "slightly_flexible",
    desired_location_range: "my_area",
    pickiness_score: 25, initial_attraction_signal: 82,
  },
  // ---------------------------------------------------------------
  // 13: רועי — THE NERDY ENGINEER
  // Very high cognitive, low social skills, introverted.
  // Awkward but genuine. Values intelligence in partner.
  // ---------------------------------------------------------------
  {
    first_name: "רועי", email: "roei@matchme-seed2.test",
    age: 29, gender: "man", looking_for_gender: "woman",
    city: "כפר סבא", height: 176, self_style: ["casual"],
    desired_age_min: 24, desired_age_max: 31, age_flexibility: "very_flexible",
    desired_height_min: 155, desired_height_max: 175, height_flexibility: "very_flexible",
    desired_location_range: "bit_further",
    pickiness_score: 35, initial_attraction_signal: 48,
  },
  // ---------------------------------------------------------------
  // 14: נטע — THE ARMY OFFICER
  // Disciplined, high work ethic, moderate cognitive.
  // Natural leader, blunt, patriotic. Moderate selectiveness.
  // ---------------------------------------------------------------
  {
    first_name: "נטע", email: "neta@matchme-seed2.test",
    age: 26, gender: "woman", looking_for_gender: "man",
    city: "ראשון לציון", height: 169, self_style: ["sporty", "casual"],
    desired_age_min: 25, desired_age_max: 33, age_flexibility: "slightly_flexible",
    desired_height_min: 172, desired_height_max: 190, height_flexibility: "slightly_flexible",
    desired_location_range: "my_area",
    pickiness_score: 50, initial_attraction_signal: 68,
  },
  // ---------------------------------------------------------------
  // 15: אדם — THE SENSITIVE MUSICIAN
  // Artistic, emotionally deep, introverted. High neuroticism.
  // Values emotional connection. Low income, high creativity.
  // ---------------------------------------------------------------
  {
    first_name: "אדם", email: "adam@matchme-seed2.test",
    age: 28, gender: "man", looking_for_gender: "woman",
    city: "תל אביב", height: 178, self_style: ["hipster", "natural"],
    desired_age_min: 23, desired_age_max: 30, age_flexibility: "very_flexible",
    desired_height_min: 155, desired_height_max: 175, height_flexibility: "very_flexible",
    desired_location_range: "my_area",
    pickiness_score: 28, initial_attraction_signal: 60,
  },
  // ---------------------------------------------------------------
  // 16: סיון — THE TRADITIONAL HOMEMAKER
  // Family-first, religious-traditional, warm. High good_kid.
  // Values stability and shared values. Very selective on religion.
  // ---------------------------------------------------------------
  {
    first_name: "סיון", email: "sivvan@matchme-seed2.test",
    age: 25, gender: "woman", looking_for_gender: "man",
    city: "מודיעין", height: 162, self_style: ["casual", "natural"],
    desired_age_min: 26, desired_age_max: 34, age_flexibility: "slightly_flexible",
    desired_height_min: 170, desired_height_max: 188, height_flexibility: "slightly_flexible",
    desired_location_range: "bit_further",
    pickiness_score: 58, initial_attraction_signal: 54,
  },
  // ---------------------------------------------------------------
  // 17: גל — THE SURFER DUDE
  // Maximum vibe/chill, low seriousness, moderate intelligence.
  // Beach lifestyle, spontaneous. Very low selectiveness.
  // ---------------------------------------------------------------
  {
    first_name: "גל", email: "gal@matchme-seed2.test",
    age: 27, gender: "man", looking_for_gender: "woman",
    city: "הרצליה", height: 180, self_style: ["sporty", "natural"],
    desired_age_min: 22, desired_age_max: 30, age_flexibility: "very_flexible",
    desired_height_min: 155, desired_height_max: 178, height_flexibility: "very_flexible",
    desired_location_range: "bit_further",
    pickiness_score: 10, initial_attraction_signal: 72,
  },
  // ---------------------------------------------------------------
  // 18: עדי — THE FIERCE FEMINIST
  // Politically engaged, high openness, moderate cognitive.
  // Values equality, progressive values. Blunt communicator.
  // ---------------------------------------------------------------
  {
    first_name: "עדי", email: "adi@matchme-seed2.test",
    age: 28, gender: "woman", looking_for_gender: "doesnt_matter",
    city: "תל אביב", height: 165, self_style: ["hipster", "casual"],
    desired_age_min: 24, desired_age_max: 35, age_flexibility: "very_flexible",
    desired_height_min: 155, desired_height_max: 190, height_flexibility: "very_flexible",
    desired_location_range: "my_area",
    pickiness_score: 38, initial_attraction_signal: 62,
  },
  // ---------------------------------------------------------------
  // 19: אריאל — THE LUXURY BUSINESSMAN
  // High luxury orientation, appearance-focused, high cognitive.
  // Status-driven, polished. Very selective.
  // ---------------------------------------------------------------
  {
    first_name: "אריאל", email: "ariel@matchme-seed2.test",
    age: 35, gender: "man", looking_for_gender: "woman",
    city: "הרצליה", height: 182, self_style: ["elegant", "groomed"],
    desired_age_min: 25, desired_age_max: 33, age_flexibility: "not_flexible",
    desired_height_min: 162, desired_height_max: 178, height_flexibility: "not_flexible",
    desired_location_range: "my_area",
    pickiness_score: 85, initial_attraction_signal: 76,
  },
  // ---------------------------------------------------------------
  // 20: מור — THE QUIET CARETAKER
  // Nurse, high warmth, moderate intelligence. Very stable.
  // Selfless, loves animals and children. Low selectiveness.
  // ---------------------------------------------------------------
  {
    first_name: "מור", email: "mor@matchme-seed2.test",
    age: 30, gender: "woman", looking_for_gender: "man",
    city: "נתניה", height: 164, self_style: ["casual", "natural"],
    desired_age_min: 27, desired_age_max: 36, age_flexibility: "very_flexible",
    desired_height_min: 168, desired_height_max: 192, height_flexibility: "very_flexible",
    desired_location_range: "bit_further",
    pickiness_score: 15, initial_attraction_signal: 56,
  },
];

// ── Chat answers ────────────────────────────────────────────────

const chatAnswers = [
  // אביגיל
  "I spend most evenings reading or writing. I need someone who respects my need for quiet time but can also pull me out of my shell sometimes. Deep conversations over coffee are my idea of a perfect date.",
  // איתי
  "I work in tech and I love solving problems — at work and in life. Looking for someone smart who has her own thing going on. I like efficiency and honesty. Weekend trips to Europe are a plus.",
  // הילה
  "I'm a people person! I love going out, meeting new people, dancing, and just having fun. Looking for someone who can keep up with my energy and doesn't take life too seriously.",
  // עמית
  "Faith and family are the center of my life. I'm looking for a woman who shares my values and wants to build a Jewish home together. I'm traditional but open-minded about many things.",
  // יעל
  "I'm a lawyer and I bring the same intensity to relationships as I do to my career. I want someone who's intellectually stimulating and emotionally mature. No games.",
  // ניר
  "Give me a backpack and a trail and I'm happy. I climb, hike, kayak — you name it. Looking for someone adventurous who'd rather sleep under the stars than in a five-star hotel.",
  // מאיה
  "I teach yoga and live mindfully. I believe in genuine connections, not superficial ones. Looking for someone grounded, authentic, and open to growth. Vegetarian-friendly is a bonus.",
  // אלון
  "Life's too short to be serious all the time. I love making people laugh and I'm looking for someone who can appreciate my humor and throw it right back at me. Also, I make amazing shakshuka.",
  // שי
  "I'm a competitive swimmer and fitness is a big part of my identity. Looking for a guy who takes care of himself and has substance beyond the gym. Loyalty is everything.",
  // דנה
  "I founded a startup at 28 and haven't slowed down since. I need someone who understands ambition and doesn't feel threatened by a strong woman. Intellectual sparring is foreplay.",
  // תומר
  "I'm a big guy with a soft heart. I volunteer at an animal shelter on weekends and I'm happiest when I'm cooking for people I love. Looking for someone genuine — the rest we can figure out.",
  // לינוי
  "I just want to have fun and see where things go! I love clubs, festivals, and spontaneous trips. Not looking for anything too heavy right now — just a good vibe and good times.",
  // רועי
  "I'm an engineer and I know I'm a bit awkward at first. But once you get past the shell, I'm loyal, caring, and I'll debug your laptop at 2am. Looking for someone patient and smart.",
  // נטע
  "Three years in the army taught me discipline and leadership. I'm direct and I know what I want. Looking for someone strong, honest, and not afraid to challenge me.",
  // אדם
  "I play guitar in a band and write songs about things that keep me up at night. I feel everything deeply — some say too deeply. Looking for someone who gets that intensity.",
  // סיון
  "Family is everything to me. I grew up in a warm traditional home and I want to create the same for my children. Looking for a man who shares these values and is ready to build together.",
  // גל
  "Surf, eat, sleep, repeat. I'm the most chill person you'll ever meet. Looking for someone who doesn't stress about the small stuff and enjoys the simple things in life.",
  // עדי
  "I'm politically active and I care about making the world more equal. I value courage, authenticity, and someone who challenges societal norms. Gender is the least interesting thing about a person.",
  // אריאל
  "I run a real estate company and I appreciate the finer things in life. Looking for an elegant woman who carries herself well and values quality. I believe in traditional courtship.",
  // מור
  "I'm a nurse and I spend my days caring for others. At home, I just want someone warm and kind who makes me feel safe. I love animals, cooking, and long walks on the beach.",
];

// ── Trait profiles (35 traits each) ─────────────────────────────
// Format: [score (0-100), confidence (0-1)]
// Trait order by sort_order:
//  1 cognitive  2 vibe  3 emotional_stability  4 neuroticism  5 style_type(skip)
//  6 family  7 party  8 luxury  9 extrovert  10 energy  11 analytical
// 12 seriousness  13 goofiness  14 religiosity  15 self_awareness  16 humor
// 17 political_orientation  18 social_involvement  19 positivity  20 warmth
// 21 openness  22 childishness  23 value_rigidity  24 loves_animals  25 zionism
// 26 political_leaning  27 vegetarianism  28 work_ethic  29 good_kid
// 30 appearance_sensitivity(int)  31 bluntness  32 toxicity(int)  33 trollness(int)
// 34 sexual_identity(filter)  35 deal_breakers(int)

type TP = [number, number][];

const traitProfiles: TP[] = [
  // ── אביגיל — QUIET BOOKWORM: high cognitive, low extrovert, high analytical
  [
    [85, 0.85], // cognitive — very high
    [50, 0.60], // vibe — moderate
    [72, 0.75], // emotional_stability — good
    [35, 0.65], // neuroticism — moderate-low
    [0, 0],     // style_type
    [55, 0.55], // family — moderate
    [20, 0.55], // party — homebody
    [30, 0.45], // luxury — modest
    [25, 0.70], // extrovert — clearly introverted
    [40, 0.55], // energy — low-moderate
    [82, 0.80], // analytical — very high
    [68, 0.65], // seriousness — fairly serious
    [30, 0.50], // goofiness — not very
    [25, 0.55], // religiosity — secular
    [75, 0.75], // self_awareness — high
    [55, 0.55], // humor — dry wit
    [45, 0.50], // political_orientation — moderate
    [35, 0.45], // social_involvement — limited
    [60, 0.55], // positivity — cautiously positive
    [62, 0.60], // warmth — warm once close
    [68, 0.65], // openness — fairly open
    [22, 0.65], // childishness — mature
    [40, 0.55], // value_rigidity — moderate
    [55, 0.50], // loves_animals — likes them
    [45, 0.40], // zionism — moderate
    [42, 0.40], // political_leaning — center-left
    [20, 0.30], // vegetarianism — no
    [65, 0.55], // work_ethic — solid
    [72, 0.60], // good_kid — rule-follower
    [25, 0.35], // appearance_sensitivity
    [20, 0.50], // bluntness — gentle
    [4, 0.30],  // toxicity
    [2, 0.30],  // trollness
    [0, 0],     // sexual_identity
    [0, 0],     // deal_breakers
  ],

  // ── איתי — TECH BRO: high cognitive + analytical, moderate extrovert, luxury
  [
    [80, 0.80], [58, 0.60], [68, 0.70], [32, 0.60], [0, 0],
    [55, 0.55], [55, 0.60], [72, 0.70], [62, 0.60], [70, 0.65],
    [85, 0.85], [65, 0.65], [45, 0.55], [25, 0.55], [58, 0.60],
    [55, 0.55], [35, 0.45], [40, 0.45], [62, 0.55], [52, 0.50],
    [55, 0.55], [30, 0.60], [52, 0.55], [40, 0.40], [55, 0.45],
    [55, 0.45], [12, 0.20], [75, 0.65], [62, 0.55],
    [60, 0.50], [45, 0.55], [10, 0.30], [5, 0.30], [0, 0], [0, 0],
  ],

  // ── הילה — SOCIAL BUTTERFLY: max extrovert + party, low depth
  [
    [58, 0.60], [78, 0.75], [55, 0.55], [42, 0.60], [0, 0],
    [42, 0.45], [90, 0.85], [70, 0.70], [92, 0.85], [85, 0.80],
    [30, 0.45], [25, 0.50], [72, 0.70], [18, 0.50], [40, 0.45],
    [75, 0.70], [25, 0.35], [55, 0.50], [82, 0.75], [72, 0.65],
    [70, 0.65], [55, 0.60], [25, 0.50], [48, 0.45], [40, 0.35],
    [42, 0.35], [15, 0.20], [42, 0.40], [45, 0.45],
    [65, 0.55], [30, 0.50], [8, 0.30], [5, 0.30], [0, 0], [0, 0],
  ],

  // ── עמית — RELIGIOUS FAMILY MAN: very high family + religiosity, moderate cognitive
  [
    [65, 0.70], [48, 0.55], [78, 0.75], [25, 0.70], [0, 0],
    [92, 0.90], [18, 0.55], [35, 0.45], [42, 0.55], [52, 0.55],
    [50, 0.55], [75, 0.70], [30, 0.50], [82, 0.85], [65, 0.65],
    [48, 0.50], [35, 0.45], [65, 0.60], [62, 0.55], [78, 0.70],
    [35, 0.50], [18, 0.70], [75, 0.75], [45, 0.45], [78, 0.65],
    [68, 0.55], [8, 0.20], [72, 0.60], [85, 0.75],
    [22, 0.35], [25, 0.50], [5, 0.30], [2, 0.30], [0, 0], [0, 0],
  ],

  // ── יעל — AMBITIOUS LAWYER: very high cognitive, analytical, serious
  [
    [88, 0.85], [52, 0.55], [70, 0.70], [38, 0.65], [0, 0],
    [58, 0.55], [42, 0.50], [68, 0.65], [58, 0.55], [72, 0.65],
    [82, 0.80], [78, 0.75], [28, 0.50], [22, 0.55], [72, 0.70],
    [48, 0.50], [55, 0.55], [50, 0.50], [55, 0.50], [50, 0.50],
    [55, 0.55], [18, 0.70], [55, 0.55], [38, 0.40], [52, 0.45],
    [45, 0.40], [15, 0.25], [85, 0.75], [65, 0.60],
    [62, 0.55], [68, 0.65], [12, 0.30], [4, 0.30], [0, 0], [0, 0],
  ],

  // ── ניר — OUTDOOR ADVENTURER: high energy, vibe, low luxury
  [
    [68, 0.65], [82, 0.80], [72, 0.70], [28, 0.65], [0, 0],
    [55, 0.55], [55, 0.55], [18, 0.40], [65, 0.65], [92, 0.85],
    [45, 0.50], [42, 0.50], [65, 0.60], [22, 0.50], [62, 0.60],
    [68, 0.65], [30, 0.40], [55, 0.50], [78, 0.70], [68, 0.65],
    [75, 0.70], [42, 0.55], [30, 0.50], [82, 0.75], [62, 0.50],
    [50, 0.45], [25, 0.30], [58, 0.50], [50, 0.50],
    [25, 0.35], [40, 0.55], [6, 0.30], [3, 0.30], [0, 0], [0, 0],
  ],

  // ── מאיה — YOGA SPIRITUALIST: high openness + self_awareness, vegetarian
  [
    [72, 0.70], [78, 0.75], [80, 0.80], [22, 0.70], [0, 0],
    [62, 0.60], [32, 0.45], [25, 0.40], [42, 0.50], [55, 0.55],
    [50, 0.55], [55, 0.55], [45, 0.50], [15, 0.50], [85, 0.85],
    [55, 0.55], [50, 0.50], [65, 0.60], [82, 0.75], [80, 0.75],
    [90, 0.85], [35, 0.55], [18, 0.50], [88, 0.80], [38, 0.35],
    [32, 0.35], [78, 0.70], [50, 0.45], [55, 0.50],
    [15, 0.30], [22, 0.45], [3, 0.30], [2, 0.30], [0, 0], [0, 0],
  ],

  // ── אלון — CLASS CLOWN: max goofiness + humor, low seriousness
  [
    [62, 0.60], [85, 0.80], [60, 0.60], [35, 0.55], [0, 0],
    [50, 0.50], [75, 0.70], [35, 0.45], [72, 0.70], [78, 0.75],
    [35, 0.45], [22, 0.55], [90, 0.85], [20, 0.50], [52, 0.55],
    [92, 0.85], [28, 0.35], [50, 0.50], [85, 0.80], [72, 0.65],
    [72, 0.65], [58, 0.60], [22, 0.50], [60, 0.55], [45, 0.40],
    [42, 0.35], [18, 0.25], [45, 0.40], [40, 0.45],
    [30, 0.35], [35, 0.50], [7, 0.30], [8, 0.35], [0, 0], [0, 0],
  ],

  // ── שי — GAY ATHLETE: high energy + discipline, sporty
  [
    [70, 0.70], [60, 0.60], [72, 0.70], [28, 0.65], [0, 0],
    [48, 0.50], [52, 0.55], [55, 0.55], [62, 0.60], [88, 0.85],
    [55, 0.55], [65, 0.60], [40, 0.50], [18, 0.50], [60, 0.60],
    [55, 0.55], [42, 0.45], [52, 0.50], [65, 0.60], [55, 0.55],
    [58, 0.55], [28, 0.60], [42, 0.50], [45, 0.45], [55, 0.45],
    [48, 0.40], [12, 0.20], [80, 0.70], [58, 0.55],
    [62, 0.55], [42, 0.55], [5, 0.30], [3, 0.30], [0, 0], [0, 0],
  ],

  // ── דנה — STARTUP FOUNDER: very high cognitive + bluntness, driven
  [
    [90, 0.85], [48, 0.55], [65, 0.65], [40, 0.60], [0, 0],
    [50, 0.50], [45, 0.50], [72, 0.70], [60, 0.55], [82, 0.75],
    [80, 0.80], [75, 0.70], [32, 0.50], [15, 0.45], [72, 0.70],
    [55, 0.55], [55, 0.55], [50, 0.50], [55, 0.50], [45, 0.45],
    [65, 0.60], [15, 0.70], [48, 0.55], [35, 0.40], [50, 0.45],
    [42, 0.40], [20, 0.25], [92, 0.85], [52, 0.50],
    [50, 0.45], [82, 0.80], [15, 0.35], [5, 0.30], [0, 0], [0, 0],
  ],

  // ── תומר — GENTLE GIANT: high warmth + stability, low selectiveness
  [
    [68, 0.65], [72, 0.70], [85, 0.80], [18, 0.75], [0, 0],
    [75, 0.70], [28, 0.45], [22, 0.40], [35, 0.55], [50, 0.50],
    [48, 0.50], [58, 0.55], [48, 0.50], [30, 0.55], [72, 0.70],
    [60, 0.55], [35, 0.40], [62, 0.55], [75, 0.65], [88, 0.80],
    [68, 0.65], [28, 0.60], [40, 0.50], [92, 0.85], [55, 0.45],
    [48, 0.40], [30, 0.30], [60, 0.50], [68, 0.60],
    [15, 0.25], [20, 0.45], [3, 0.30], [2, 0.30], [0, 0], [0, 0],
  ],

  // ── לינוי — YOUNG PARTIER: high party + extrovert, low seriousness
  [
    [55, 0.55], [80, 0.75], [50, 0.55], [45, 0.55], [0, 0],
    [35, 0.40], [88, 0.85], [68, 0.65], [85, 0.80], [82, 0.75],
    [28, 0.40], [20, 0.50], [75, 0.70], [15, 0.45], [38, 0.45],
    [72, 0.65], [20, 0.30], [42, 0.40], [80, 0.70], [68, 0.60],
    [65, 0.60], [62, 0.65], [20, 0.50], [45, 0.40], [35, 0.30],
    [40, 0.30], [10, 0.20], [35, 0.35], [42, 0.40],
    [55, 0.50], [28, 0.45], [10, 0.30], [8, 0.30], [0, 0], [0, 0],
  ],

  // ── רועי — NERDY ENGINEER: very high cognitive + analytical, low extrovert
  [
    [92, 0.90], [42, 0.50], [65, 0.65], [40, 0.60], [0, 0],
    [50, 0.50], [18, 0.45], [35, 0.45], [22, 0.65], [45, 0.50],
    [90, 0.85], [70, 0.65], [35, 0.50], [20, 0.50], [55, 0.55],
    [48, 0.50], [30, 0.40], [28, 0.40], [52, 0.50], [50, 0.50],
    [55, 0.55], [35, 0.55], [48, 0.55], [42, 0.40], [50, 0.40],
    [45, 0.40], [15, 0.20], [78, 0.65], [68, 0.60],
    [20, 0.30], [25, 0.45], [5, 0.30], [3, 0.30], [0, 0], [0, 0],
  ],

  // ── נטע — ARMY OFFICER: high work ethic + bluntness, disciplined
  [
    [70, 0.70], [55, 0.55], [78, 0.75], [28, 0.65], [0, 0],
    [62, 0.60], [40, 0.50], [45, 0.50], [62, 0.60], [80, 0.75],
    [55, 0.55], [75, 0.70], [32, 0.50], [35, 0.55], [68, 0.65],
    [50, 0.50], [50, 0.50], [62, 0.55], [62, 0.55], [58, 0.55],
    [55, 0.55], [20, 0.65], [55, 0.55], [50, 0.45], [75, 0.60],
    [62, 0.50], [12, 0.20], [85, 0.75], [72, 0.65],
    [40, 0.40], [72, 0.70], [8, 0.30], [4, 0.30], [0, 0], [0, 0],
  ],

  // ── אדם — SENSITIVE MUSICIAN: high neuroticism, deep emotions, artistic
  [
    [75, 0.70], [72, 0.70], [48, 0.55], [62, 0.70], [0, 0],
    [45, 0.45], [55, 0.55], [20, 0.35], [38, 0.55], [50, 0.50],
    [55, 0.55], [40, 0.50], [52, 0.55], [15, 0.45], [78, 0.75],
    [68, 0.60], [48, 0.50], [55, 0.50], [55, 0.50], [72, 0.65],
    [82, 0.75], [45, 0.55], [22, 0.50], [58, 0.50], [35, 0.35],
    [32, 0.35], [40, 0.35], [38, 0.40], [35, 0.40],
    [18, 0.30], [30, 0.50], [5, 0.30], [3, 0.30], [0, 0], [0, 0],
  ],

  // ── סיון — TRADITIONAL HOMEMAKER: very high family + religiosity, warm
  [
    [62, 0.60], [52, 0.55], [75, 0.70], [28, 0.65], [0, 0],
    [90, 0.90], [15, 0.45], [30, 0.40], [45, 0.50], [48, 0.50],
    [42, 0.45], [70, 0.65], [35, 0.50], [80, 0.80], [60, 0.60],
    [50, 0.50], [30, 0.40], [60, 0.55], [68, 0.60], [82, 0.75],
    [35, 0.45], [22, 0.65], [72, 0.70], [55, 0.50], [72, 0.60],
    [65, 0.50], [8, 0.20], [55, 0.50], [88, 0.80],
    [25, 0.35], [18, 0.45], [3, 0.30], [2, 0.30], [0, 0], [0, 0],
  ],

  // ── גל — SURFER DUDE: max vibe, low seriousness, chill
  [
    [60, 0.60], [95, 0.90], [68, 0.65], [22, 0.65], [0, 0],
    [45, 0.45], [65, 0.60], [20, 0.35], [70, 0.65], [75, 0.70],
    [30, 0.40], [18, 0.55], [78, 0.75], [15, 0.45], [55, 0.55],
    [72, 0.65], [18, 0.30], [40, 0.40], [88, 0.80], [72, 0.65],
    [78, 0.70], [52, 0.55], [15, 0.50], [68, 0.60], [42, 0.35],
    [40, 0.35], [30, 0.30], [32, 0.35], [38, 0.40],
    [20, 0.30], [25, 0.45], [5, 0.30], [3, 0.30], [0, 0], [0, 0],
  ],

  // ── עדי — FIERCE FEMINIST: high political + openness, blunt, progressive
  [
    [72, 0.70], [68, 0.65], [62, 0.60], [38, 0.55], [0, 0],
    [42, 0.45], [58, 0.55], [25, 0.40], [65, 0.60], [70, 0.65],
    [58, 0.55], [55, 0.55], [52, 0.55], [10, 0.45], [72, 0.70],
    [62, 0.55], [85, 0.80], [78, 0.70], [62, 0.55], [60, 0.55],
    [88, 0.80], [38, 0.50], [12, 0.50], [65, 0.55], [25, 0.30],
    [22, 0.35], [55, 0.45], [55, 0.50], [32, 0.40],
    [15, 0.25], [72, 0.70], [10, 0.30], [5, 0.30], [0, 0], [0, 0],
  ],

  // ── אריאל — LUXURY BUSINESSMAN: high luxury + cognitive, very selective
  [
    [82, 0.80], [42, 0.50], [72, 0.70], [30, 0.60], [0, 0],
    [62, 0.60], [48, 0.55], [92, 0.85], [58, 0.55], [68, 0.60],
    [72, 0.70], [78, 0.75], [22, 0.50], [40, 0.55], [58, 0.55],
    [40, 0.45], [40, 0.45], [42, 0.45], [52, 0.50], [42, 0.45],
    [38, 0.45], [15, 0.70], [68, 0.65], [30, 0.35], [65, 0.50],
    [62, 0.50], [5, 0.15], [82, 0.75], [72, 0.65],
    [82, 0.70], [55, 0.60], [15, 0.35], [5, 0.30], [0, 0], [0, 0],
  ],

  // ── מור — QUIET CARETAKER: very high warmth + stability, moderate cognitive
  [
    [65, 0.65], [65, 0.60], [82, 0.80], [20, 0.70], [0, 0],
    [78, 0.70], [25, 0.45], [22, 0.35], [42, 0.50], [50, 0.50],
    [42, 0.45], [58, 0.55], [42, 0.50], [28, 0.50], [68, 0.65],
    [55, 0.50], [30, 0.35], [58, 0.50], [78, 0.70], [90, 0.85],
    [65, 0.60], [30, 0.55], [42, 0.50], [88, 0.80], [50, 0.40],
    [45, 0.40], [25, 0.25], [68, 0.55], [75, 0.65],
    [18, 0.25], [18, 0.40], [3, 0.30], [2, 0.30], [0, 0], [0, 0],
  ],
];

// ── Look trait profiles ─────────────────────────────────────────
// 10 traits: [personal_value, confidence, desired_value, weight_for_match]

type LE = [string | null, number, string | null, number];

const lookProfiles: LE[][] = [
  // אביגיל — bookworm: natural, low appearance care
  [[null,0,null,0], ["163",0.95,null,30], ["natural",0.75,null,15], ["slim",0.70,null,15],
   ["light",0.80,null,0], ["dark",0.75,null,0], ["dark",0.75,null,0],
   ["medium",0.60,null,10], ["straight",0.80,null,5], ["feminine",0.80,"masculine",25]],

  // איתי — tech bro: groomed, wants groomed partner
  [[null,0,null,0], ["180",0.95,null,35], ["groomed",0.80,"groomed",50], ["toned",0.70,null,45],
   ["light",0.75,null,5], ["dark",0.80,null,0], ["dark",0.75,null,0],
   ["high",0.75,null,40], ["short",0.80,null,5], ["masculine",0.80,"feminine",50]],

  // הילה — social butterfly: elegant, high grooming, wants tall
  [[null,0,null,0], ["167",0.95,null,55], ["elegant",0.85,"groomed",55], ["slim",0.75,null,40],
   ["light",0.80,null,5], ["blonde",0.80,null,0], ["light",0.75,null,0],
   ["very_high",0.85,null,55], ["long",0.80,null,5], ["feminine",0.85,"masculine",55]],

  // עמית — religious: casual, low appearance focus
  [[null,0,null,0], ["177",0.95,null,15], ["casual",0.70,null,10], ["toned",0.60,null,15],
   ["light",0.75,null,0], ["dark",0.80,null,0], ["dark",0.75,null,0],
   ["medium",0.55,null,10], ["short",0.75,null,5], ["masculine",0.75,"feminine",25]],

  // יעל — lawyer: elegant, wants groomed tall man
  [[null,0,null,0], ["170",0.95,null,65], ["elegant",0.85,"groomed",65], ["slim",0.75,"toned",55],
   ["light",0.80,null,5], ["dark",0.75,null,0], ["dark",0.75,null,0],
   ["very_high",0.80,"high",55], ["straight",0.80,null,10], ["feminine",0.85,"masculine",60]],

  // ניר — adventurer: sporty natural, low care about partner looks
  [[null,0,null,0], ["183",0.95,null,15], ["sporty",0.80,null,15], ["toned",0.75,null,20],
   ["tanned",0.75,null,0], ["dark",0.75,null,0], ["dark",0.70,null,0],
   ["medium",0.60,null,10], ["short",0.75,null,5], ["masculine",0.80,"feminine",25]],

  // מאיה — yoga: natural, open preferences
  [[null,0,null,0], ["166",0.95,null,15], ["natural",0.80,null,10], ["slim",0.70,null,10],
   ["tanned",0.70,null,0], ["dark",0.75,null,0], ["dark",0.70,null,0],
   ["medium",0.55,null,5], ["long",0.80,null,5], ["feminine",0.80,null,10]],

  // אלון — class clown: casual, low care
  [[null,0,null,0], ["175",0.95,null,20], ["casual",0.70,null,10], ["toned",0.60,null,15],
   ["light",0.75,null,0], ["dark",0.80,null,0], ["dark",0.75,null,0],
   ["medium",0.55,null,10], ["short",0.75,null,5], ["masculine",0.75,"feminine",30]],

  // שי — gay athlete: sporty groomed, wants masculine fit
  [[null,0,null,0], ["181",0.95,null,45], ["sporty",0.85,"sporty",60], ["muscular",0.85,"toned",70],
   ["tan",0.75,null,5], ["dark",0.80,null,0], ["dark",0.75,null,0],
   ["very_high",0.80,"high",50], ["short",0.80,null,5], ["masculine",0.85,"masculine",75]],

  // דנה — startup founder: groomed casual, moderate care
  [[null,0,null,0], ["172",0.95,null,35], ["groomed",0.75,"groomed",40], ["slim",0.70,null,30],
   ["light",0.80,null,0], ["dark",0.75,null,0], ["dark",0.75,null,0],
   ["high",0.70,null,35], ["straight",0.80,null,5], ["feminine",0.80,"masculine",45]],

  // תומר — gentle giant: casual natural, very low care
  [[null,0,null,0], ["192",0.95,null,10], ["casual",0.70,null,5], ["muscular",0.65,null,5],
   ["light",0.75,null,0], ["dark",0.80,null,0], ["dark",0.75,null,0],
   ["medium",0.50,null,5], ["short",0.75,null,5], ["masculine",0.80,"feminine",15]],

  // לינוי — young partier: elegant, wants tall groomed
  [[null,0,null,0], ["164",0.95,null,55], ["elegant",0.85,"groomed",60], ["slim",0.75,null,45],
   ["light",0.80,null,5], ["blonde",0.75,null,0], ["light",0.70,null,0],
   ["very_high",0.85,null,55], ["long",0.85,null,5], ["feminine",0.85,"masculine",55]],

  // רועי — nerdy engineer: casual, very low care
  [[null,0,null,0], ["176",0.95,null,10], ["casual",0.65,null,5], ["slim",0.60,null,5],
   ["light",0.75,null,0], ["dark",0.80,null,0], ["dark",0.75,null,0],
   ["low",0.55,null,5], ["short",0.75,null,5], ["masculine",0.75,"feminine",15]],

  // נטע — army officer: sporty, wants fit partner
  [[null,0,null,0], ["169",0.95,null,45], ["sporty",0.80,"sporty",50], ["toned",0.80,"toned",55],
   ["tanned",0.75,null,5], ["dark",0.75,null,0], ["dark",0.75,null,0],
   ["high",0.75,"high",40], ["long",0.80,null,5], ["feminine",0.80,"masculine",50]],

  // אדם — musician: hipster, low care
  [[null,0,null,0], ["178",0.95,null,10], ["hipster",0.80,null,5], ["slim",0.65,null,5],
   ["light",0.75,null,0], ["dark",0.80,null,0], ["dark",0.75,null,0],
   ["low",0.55,null,5], ["curly",0.80,null,5], ["masculine",0.75,"feminine",15]],

  // סיון — homemaker: casual natural, moderate care
  [[null,0,null,0], ["162",0.95,null,30], ["casual",0.70,null,20], ["slim",0.70,null,20],
   ["light",0.80,null,0], ["dark",0.75,null,0], ["dark",0.75,null,0],
   ["medium",0.60,null,15], ["long",0.80,null,5], ["feminine",0.80,"masculine",35]],

  // גל — surfer: sporty natural, low care
  [[null,0,null,0], ["180",0.95,null,15], ["sporty",0.80,null,10], ["toned",0.75,null,15],
   ["tanned",0.80,null,0], ["blonde",0.75,null,0], ["light",0.70,null,0],
   ["medium",0.55,null,5], ["long",0.80,null,5], ["masculine",0.80,"feminine",20]],

  // עדי — feminist: hipster casual, very low care
  [[null,0,null,0], ["165",0.95,null,5], ["hipster",0.75,null,5], ["slim",0.60,null,5],
   ["light",0.75,null,0], ["dark",0.75,null,0], ["dark",0.70,null,0],
   ["low",0.55,null,5], ["short",0.75,null,5], ["androgynous",0.70,null,5]],

  // אריאל — luxury: elegant groomed, wants polished partner
  [[null,0,null,0], ["182",0.95,null,55], ["elegant",0.85,"elegant",70], ["toned",0.80,"slim",65],
   ["light",0.80,null,5], ["dark",0.80,null,0], ["dark",0.75,null,0],
   ["very_high",0.85,"very_high",65], ["short",0.85,null,10], ["masculine",0.85,"feminine",70]],

  // מור — caretaker: casual natural, very low care
  [[null,0,null,0], ["164",0.95,null,10], ["casual",0.70,null,5], ["slim",0.65,null,5],
   ["light",0.75,null,0], ["light_brown",0.70,null,0], ["light",0.70,null,0],
   ["medium",0.55,null,5], ["long",0.80,null,5], ["feminine",0.80,null,10]],
];

// ── Insert logic (same structure as seed.ts) ────────────────────

const insertUser = db.prepare(`
  INSERT INTO users (
    first_name, email, age, gender, looking_for_gender,
    city, height, self_style,
    desired_age_min, desired_age_max, age_flexibility,
    desired_height_min, desired_height_max, height_flexibility,
    desired_location_range,
    is_real_user, is_matchable, user_status, valid_person,
    pickiness_score, initial_attraction_signal
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 'waiting_match', 1, ?, ?)
  RETURNING id
`);

const insertProfile = db.prepare(
  "INSERT INTO profiles (user_id, raw_answer, analysis_json) VALUES (?, ?, ?)"
);

const insertUserTrait = db.prepare(`
  INSERT INTO user_traits (user_id, trait_definition_id, score, confidence, weight_for_match, weight_confidence, source)
  VALUES (?, ?, ?, ?, ?, ?, 'ai')
`);

const insertUserLookTrait = db.prepare(`
  INSERT INTO user_look_traits (
    user_id, look_trait_definition_id,
    personal_value, personal_value_confidence,
    desired_value, desired_value_confidence,
    weight_for_match, weight_confidence, source
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai')
`);

const traitDefs = db.prepare("SELECT id, weight FROM trait_definitions ORDER BY sort_order").all() as { id: number; weight: number }[];
const lookTraitDefs = db.prepare("SELECT id FROM look_trait_definitions ORDER BY sort_order").all() as { id: number }[];

db.transaction(() => {
  for (let i = 0; i < users.length; i++) {
    const u = users[i];

    const row = insertUser.get(
      u.first_name, u.email, u.age, u.gender, u.looking_for_gender,
      u.city, u.height, JSON.stringify(u.self_style),
      u.desired_age_min, u.desired_age_max, u.age_flexibility,
      u.desired_height_min, u.desired_height_max, u.height_flexibility,
      u.desired_location_range,
      u.pickiness_score, u.initial_attraction_signal,
    ) as { id: number };
    const userId = row.id;

    // Profile
    const tp = traitProfiles[i];
    const analysis = {
      intelligence_score: Math.round(tp[0][0] / 10),
      emotional_depth_score: Math.round(tp[2][0] / 10),
      social_style: tp[8][0] > 60 ? "extroverted" : tp[8][0] < 45 ? "introverted" : "balanced",
      relationship_goal: tp[5][0] > 65 ? "serious" : tp[5][0] < 45 ? "casual" : "unsure",
    };
    insertProfile.run(userId, chatAnswers[i], JSON.stringify(analysis));

    // Personality traits
    for (let t = 0; t < traitDefs.length && t < tp.length; t++) {
      const [score, confidence] = tp[t];
      if (score === 0 && confidence === 0) continue;
      const weightConf = Math.max(0.3, confidence - 0.15);
      insertUserTrait.run(userId, traitDefs[t].id, score, confidence, traitDefs[t].weight, weightConf);
    }

    // Look traits
    for (let lt = 0; lt < lookTraitDefs.length && lt < lookProfiles[i].length; lt++) {
      const [pv, pc, dv, w] = lookProfiles[i][lt];
      if (!pv && !dv) continue;
      const dc = dv ? Math.max(0.4, pc - 0.1) : null;
      const wc = Math.max(0.3, pc - 0.15);
      insertUserLookTrait.run(userId, lookTraitDefs[lt].id, pv, pc, dv, dc, w, wc);
    }

    console.log(`  ✓ ${u.first_name} (ID ${userId}) — ${u.gender}, age ${u.age}, ${u.city}`);
  }
})();

// Verification
const totalUsers = (db.prepare("SELECT COUNT(*) as c FROM users").get() as any).c;
const seed2Count = (db.prepare("SELECT COUNT(*) as c FROM users WHERE email LIKE '%@matchme-seed2.test'").get() as any).c;
const totalTraits = (db.prepare("SELECT COUNT(*) as c FROM user_traits WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@matchme-seed2.test')").get() as any).c;
const totalLook = (db.prepare("SELECT COUNT(*) as c FROM user_look_traits WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@matchme-seed2.test')").get() as any).c;

console.log(`
✅ Seed2 complete!
   New users:    ${seed2Count}
   Total users:  ${totalUsers}
   Traits:       ${totalTraits}
   Look traits:  ${totalLook}
`);
