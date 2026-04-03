/**
 * Seed Script — 10 fictional users with full data
 * =================================================
 * Run: npx ts-node src/seed.ts
 *
 * Creates 10 diverse, realistic users with:
 * - Full registration data (all form fields populated)
 * - AI-derived personality traits (35 traits, meaningful per-user scores)
 * - Look traits (10 physical traits with personal + desired values)
 * - Chat profiles (simulated answers + analysis JSON)
 * - System fields (is_matchable=1, pickiness, attraction signal)
 *
 * Re-runnable: deletes existing seed users (by email pattern) then re-inserts.
 * Seed users are marked is_real_user=0 so they can be filtered out in production.
 */

import db from "./db";

// ── Clean previous seed data (cascade manually) ──────────────────

const existingIds = db
  .prepare("SELECT id FROM users WHERE email LIKE '%@matchme-seed.test'")
  .all() as { id: number }[];

if (existingIds.length > 0) {
  const ids = existingIds.map((r) => r.id);
  console.log(`Removing ${ids.length} existing seed users...`);
  db.transaction(() => {
    for (const id of ids) {
      db.prepare("DELETE FROM match_scores WHERE match_id IN (SELECT id FROM matches WHERE user1_id = ? OR user2_id = ?)").run(id, id);
      db.prepare("DELETE FROM matches WHERE user1_id = ? OR user2_id = ?").run(id, id);
      db.prepare("DELETE FROM user_traits WHERE user_id = ?").run(id);
      db.prepare("DELETE FROM user_look_traits WHERE user_id = ?").run(id);
      db.prepare("DELETE FROM profiles WHERE user_id = ?").run(id);
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
    }
  })();
}

// ── 10 Fictional Users ──────────────────────────────────────────
// Each user represents a distinct "type" for diversity in matching tests.

const users = [
  // ---------------------------------------------------------------
  // User 1: נועה — THE WARM EMPATH
  // Emotionally intelligent, family-oriented, gentle communicator.
  // Moderate selectiveness. Seeks deep connection over excitement.
  // ---------------------------------------------------------------
  {
    first_name: "נועה", email: "noa@matchme-seed.test",
    age: 26, gender: "woman", looking_for_gender: "man",
    city: "תל אביב", height: 165, self_style: ["casual", "natural"],
    desired_age_min: 25, desired_age_max: 32, age_flexibility: "slightly_flexible",
    desired_height_min: 170, desired_height_max: 190, height_flexibility: "slightly_flexible",
    desired_location_range: "my_area",
    pickiness_score: 45, initial_attraction_signal: 68,
  },

  // ---------------------------------------------------------------
  // User 2: אורי — THE SPORTY EXTROVERT
  // High energy, socially confident, competitive. Fitness-focused.
  // Moderate depth — more action-oriented than introspective.
  // ---------------------------------------------------------------
  {
    first_name: "אורי", email: "ori@matchme-seed.test",
    age: 29, gender: "man", looking_for_gender: "woman",
    city: "תל אביב", height: 178, self_style: ["sporty", "casual"],
    desired_age_min: 24, desired_age_max: 30, age_flexibility: "slightly_flexible",
    desired_height_min: 155, desired_height_max: 175, height_flexibility: "very_flexible",
    desired_location_range: "my_area",
    pickiness_score: 35, initial_attraction_signal: 72,
  },

  // ---------------------------------------------------------------
  // User 3: מיכל — THE AMBITIOUS PERFECTIONIST
  // Highly selective, appearance-conscious, career-driven.
  // Values status and presentation. Low flexibility on preferences.
  // ---------------------------------------------------------------
  {
    first_name: "מיכל", email: "michal@matchme-seed.test",
    age: 24, gender: "woman", looking_for_gender: "man",
    city: "הרצליה", height: 160, self_style: ["elegant", "groomed"],
    desired_age_min: 26, desired_age_max: 35, age_flexibility: "not_flexible",
    desired_height_min: 175, desired_height_max: 195, height_flexibility: "not_flexible",
    desired_location_range: "my_city",
    pickiness_score: 82, initial_attraction_signal: 75,
  },

  // ---------------------------------------------------------------
  // User 4: דניאל — THE CREATIVE FREE SPIRIT
  // Artistic, introspective, unconventional thinker. High openness.
  // Low concern for appearance; values authenticity and depth.
  // ---------------------------------------------------------------
  {
    first_name: "דניאל", email: "daniel@matchme-seed.test",
    age: 31, gender: "man", looking_for_gender: "woman",
    city: "ירושלים", height: 182, self_style: ["hipster", "natural"],
    desired_age_min: 25, desired_age_max: 33, age_flexibility: "very_flexible",
    desired_height_min: 155, desired_height_max: 175, height_flexibility: "very_flexible",
    desired_location_range: "whole_country",
    pickiness_score: 20, initial_attraction_signal: 55,
  },

  // ---------------------------------------------------------------
  // User 5: שירה — THE DRIVEN COMPETITOR
  // Sporty, direct, career-focused woman. High energy and bluntness.
  // Wants an equal partner — intellectually and physically.
  // ---------------------------------------------------------------
  {
    first_name: "שירה", email: "shira@matchme-seed.test",
    age: 27, gender: "woman", looking_for_gender: "man",
    city: "רמת גן", height: 168, self_style: ["sporty"],
    desired_age_min: 26, desired_age_max: 34, age_flexibility: "slightly_flexible",
    desired_height_min: 172, desired_height_max: 190, height_flexibility: "slightly_flexible",
    desired_location_range: "my_area",
    pickiness_score: 60, initial_attraction_signal: 70,
  },

  // ---------------------------------------------------------------
  // User 6: יונתן — THE MATURE FAMILY MAN
  // Emotionally stable, nature-loving, past the party phase.
  // Values loyalty, animals, quiet life. High self-awareness.
  // ---------------------------------------------------------------
  {
    first_name: "יונתן", email: "yonatan@matchme-seed.test",
    age: 33, gender: "man", looking_for_gender: "woman",
    city: "חיפה", height: 175, self_style: ["casual", "hipster"],
    desired_age_min: 27, desired_age_max: 35, age_flexibility: "slightly_flexible",
    desired_height_min: 158, desired_height_max: 172, height_flexibility: "slightly_flexible",
    desired_location_range: "bit_further",
    pickiness_score: 40, initial_attraction_signal: 58,
  },

  // ---------------------------------------------------------------
  // User 7: תמר — THE LAID-BACK OPTIMIST
  // Easygoing, humorous, dog-lover. High openness, low drama.
  // Very flexible preferences — cares about vibe, not checklist.
  // ---------------------------------------------------------------
  {
    first_name: "תמר", email: "tamar@matchme-seed.test",
    age: 25, gender: "woman", looking_for_gender: "man",
    city: "תל אביב", height: 170, self_style: ["natural", "casual"],
    desired_age_min: 24, desired_age_max: 30, age_flexibility: "very_flexible",
    desired_height_min: 170, desired_height_max: 195, height_flexibility: "very_flexible",
    desired_location_range: "my_area",
    pickiness_score: 15, initial_attraction_signal: 65,
  },

  // ---------------------------------------------------------------
  // User 8: עידו — THE TRADITIONAL ACHIEVER
  // Goal-oriented, fitness-focused, values discipline and loyalty.
  // Conservative values, high work ethic. Selective about partner.
  // ---------------------------------------------------------------
  {
    first_name: "עידו", email: "ido@matchme-seed.test",
    age: 28, gender: "man", looking_for_gender: "woman",
    city: "רעננה", height: 185, self_style: ["sporty", "groomed"],
    desired_age_min: 23, desired_age_max: 29, age_flexibility: "not_flexible",
    desired_height_min: 160, desired_height_max: 175, height_flexibility: "not_flexible",
    desired_location_range: "my_area",
    pickiness_score: 70, initial_attraction_signal: 78,
  },

  // ---------------------------------------------------------------
  // User 9: ליאור — THE CULTURED INTELLECTUAL
  // Gay man. Emotionally intelligent, arts-loving, cosmopolitan.
  // High self-awareness, values culture and depth. Moderate selectiveness.
  // ---------------------------------------------------------------
  {
    first_name: "ליאור", email: "lior@matchme-seed.test",
    age: 30, gender: "man", looking_for_gender: "man",
    city: "תל אביב", height: 176, self_style: ["groomed", "elegant"],
    desired_age_min: 25, desired_age_max: 36, age_flexibility: "slightly_flexible",
    desired_height_min: 170, desired_height_max: 190, height_flexibility: "slightly_flexible",
    desired_location_range: "my_area",
    pickiness_score: 50, initial_attraction_signal: 66,
  },

  // ---------------------------------------------------------------
  // User 10: רוני — THE QUIRKY NONCONFORMIST
  // Young, gender-open, creative rebel. Maximum openness, minimum rigidity.
  // Least selective — values connection and authenticity over categories.
  // ---------------------------------------------------------------
  {
    first_name: "רוני", email: "roni@matchme-seed.test",
    age: 23, gender: "woman", looking_for_gender: "doesnt_matter",
    city: "באר שבע", height: 162, self_style: ["hipster", "natural"],
    desired_age_min: 22, desired_age_max: 30, age_flexibility: "very_flexible",
    desired_height_min: 155, desired_height_max: 185, height_flexibility: "very_flexible",
    desired_location_range: "whole_country",
    pickiness_score: 10, initial_attraction_signal: 60,
  },
];

// ── Simulated chat answers (Hebrew-flavored English for readability) ──

const chatAnswers = [
  // נועה — warm empath
  "I'm looking for someone who genuinely listens and has a warm heart. I value deep conversations and a good sense of humor. Someone who is family-oriented but also loves spontaneous adventures. I grew up in a tight-knit family and that shaped who I am — I want a partner who understands that bond.",

  // אורי — sporty extrovert
  "I want a partner who is active and loves outdoor activities. She should be smart and driven, but also know how to chill and enjoy a quiet evening at home. Kindness is non-negotiable. I spend a lot of time at the gym and on hikes — I need someone who at least appreciates that lifestyle.",

  // מיכל — ambitious perfectionist
  "I'm looking for a man who is ambitious and knows where he's going in life. I want someone tall and well-dressed who can make me laugh. Must be serious about commitment. I work in finance and I'm used to high standards — I apply the same rigor to my personal life.",

  // דניאל — creative free spirit
  "I want someone creative and free-spirited who doesn't take life too seriously. Good music taste is a huge plus. I believe in deep connections over superficial attraction. I'm a photographer and I see beauty in imperfection — I want a partner who thinks the same way.",

  // שירה — driven competitor
  "Looking for a sporty, confident guy who's also emotionally available. I want someone who challenges me intellectually and supports my career goals. Good vibes are essential. I run marathons and I bring that same intensity to relationships — I need someone who can keep up.",

  // יונתן — mature family man
  "I want a woman who is genuine and down to earth. Someone who loves nature and animals. I'm past the party phase and looking for real partnership and stability. I adopted a rescue dog two years ago and honestly, I judge people by how they treat animals.",

  // תמר — laid-back optimist
  "I want someone fun and easygoing who doesn't overthink everything. Must love dogs. I value openness and honesty above everything. Life's too short for drama. I believe the best relationships are the ones where you can be silly together without any filter.",

  // עידו — traditional achiever
  "Looking for someone fit and health-conscious who also enjoys fine dining. I'm goal-oriented and want a partner with similar ambition. Loyalty and trust are my top priorities. I grew up religious and while I'm less observant now, family values still guide me.",

  // ליאור — cultured intellectual
  "I'm looking for a guy who's comfortable in his own skin and has a great sense of humor. Someone cultured who enjoys the arts, good food, and travel. Emotional intelligence matters most to me. I curate art exhibitions and I see the world through that lens.",

  // רוני — quirky nonconformist
  "I want someone who's weird in the best way possible. Gender doesn't matter to me — connection does. I value creativity, authenticity, and the ability to just be yourself. I study philosophy and I think the most interesting people are the ones who question everything.",
];

// ── Personality trait scores per user ──────────────────────────────
// 35 traits in sort_order. Each entry: [score, confidence, weight_override?]
// weight_override is optional — if omitted, uses the trait definition's default weight.
//
// Trait order (by sort_order):
//  1  cognitive_profile       2  vibe                    3  emotional_stability
//  4  neuroticism             5  style_type(special)     6  family_orientation
//  7  party_orientation       8  luxury_orientation      9  extrovert
// 10  energy_level           11  analytical_tendency    12  seriousness
// 13  goofiness              14  religiosity            15  self_awareness
// 16  humor                  17  political_orientation  18  social_involvement
// 19  positivity             20  warmth                 21  openness
// 22  childishness           23  value_rigidity         24  loves_animals
// 25  zionism                26  political_leaning      27  vegetarianism
// 28  work_ethic             29  good_kid               30  appearance_sensitivity(internal)
// 31  bluntness_score        32  toxicity_score(internal)33 trollness(internal)
// 34  sexual_identity(filter)35  deal_breakers(internal)

type TraitEntry = [number, number] | [number, number, number]; // [score, confidence, weight?]

const traitProfiles: TraitEntry[][] = [

  // ── נועה — THE WARM EMPATH ──
  // High warmth, family orientation, emotional stability. Moderate cognitive.
  // Low neuroticism, high positivity. Balanced introvert/extrovert.
  [
    [72, 0.80],  //  1 cognitive_profile — above average, not academic
    [65, 0.75],  //  2 vibe — chill but engaged
    [78, 0.85],  //  3 emotional_stability — solid emotional foundation
    [25, 0.80],  //  4 neuroticism — low anxiety
    [0, 0],      //  5 style_type — skip (special calc)
    [82, 0.85],  //  6 family_orientation — core value
    [40, 0.60],  //  7 party_orientation — light social, not a party person
    [35, 0.55],  //  8 luxury_orientation — modest tastes
    [52, 0.65],  //  9 extrovert — balanced, slight introvert lean
    [58, 0.65],  // 10 energy_level — moderate
    [48, 0.55],  // 11 analytical_tendency — more intuitive than analytical
    [50, 0.60],  // 12 seriousness — balanced
    [55, 0.60],  // 13 goofiness — playful side
    [30, 0.70],  // 14 religiosity — secular
    [72, 0.80],  // 15 self_awareness — good self-understanding
    [68, 0.65],  // 16 humor — warm humor style
    [35, 0.50],  // 17 political_orientation — not very political
    [55, 0.60],  // 18 social_involvement — moderate community ties
    [78, 0.75],  // 19 positivity — optimistic outlook
    [88, 0.85],  // 20 warmth — defining trait
    [72, 0.75],  // 21 openness — open to new experiences
    [35, 0.65],  // 22 childishness — mature
    [38, 0.60],  // 23 value_rigidity — flexible values
    [75, 0.70],  // 24 loves_animals — animal lover
    [50, 0.45],  // 25 zionism — moderate
    [45, 0.40],  // 26 political_leaning — center
    [35, 0.35],  // 27 vegetarianism — not vegetarian
    [60, 0.50],  // 28 work_ethic — decent but not obsessive
    [65, 0.55],  // 29 good_kid — rule-following tendency
    [30, 0.40],  // 30 appearance_sensitivity — low (internal)
    [30, 0.55],  // 31 bluntness_score — gentle communicator
    [5, 0.40],   // 32 toxicity_score (internal)
    [3, 0.40],   // 33 trollness (internal)
    [0, 0],      // 34 sexual_identity (filter)
    [0, 0],      // 35 deal_breakers (internal)
  ],

  // ── אורי — THE SPORTY EXTROVERT ──
  // High energy, extroversion, party orientation. Moderate depth.
  // Action-oriented, less introspective. Confident and warm.
  [
    [65, 0.70],  //  1 cognitive_profile — street smart
    [72, 0.75],  //  2 vibe — very chill
    [70, 0.70],  //  3 emotional_stability — steady
    [30, 0.65],  //  4 neuroticism — low
    [0, 0],      //  5 style_type
    [58, 0.60],  //  6 family_orientation — wants family eventually
    [72, 0.75],  //  7 party_orientation — social, enjoys going out
    [45, 0.50],  //  8 luxury_orientation — moderate
    [78, 0.80],  //  9 extrovert — clear extrovert
    [88, 0.85],  // 10 energy_level — very high
    [40, 0.50],  // 11 analytical_tendency — more instinctive
    [45, 0.55],  // 12 seriousness — laid back
    [65, 0.70],  // 13 goofiness — playful
    [25, 0.60],  // 14 religiosity — secular
    [50, 0.55],  // 15 self_awareness — average
    [72, 0.70],  // 16 humor — good humor
    [30, 0.45],  // 17 political_orientation — not engaged
    [50, 0.50],  // 18 social_involvement — moderate
    [75, 0.70],  // 19 positivity — positive
    [62, 0.60],  // 20 warmth — warm but not emotionally deep
    [60, 0.60],  // 21 openness — somewhat open
    [45, 0.60],  // 22 childishness — slightly boyish
    [35, 0.50],  // 23 value_rigidity — flexible
    [50, 0.55],  // 24 loves_animals — neutral
    [55, 0.50],  // 25 zionism — moderate positive
    [55, 0.45],  // 26 political_leaning — slight right
    [15, 0.25],  // 27 vegetarianism — meat eater
    [68, 0.60],  // 28 work_ethic — works hard to stay fit/work
    [52, 0.50],  // 29 good_kid — somewhat
    [55, 0.45],  // 30 appearance_sensitivity (internal)
    [35, 0.50],  // 31 bluntness_score — direct but not harsh
    [8, 0.35],   // 32 toxicity_score
    [5, 0.35],   // 33 trollness
    [0, 0],      // 34 sexual_identity
    [0, 0],      // 35 deal_breakers
  ],

  // ── מיכל — THE AMBITIOUS PERFECTIONIST ──
  // High analytical, luxury orientation, appearance sensitivity.
  // Selective, career-driven. Lower warmth, higher seriousness.
  [
    [82, 0.85],  //  1 cognitive_profile — sharp, analytical mind
    [45, 0.60],  //  2 vibe — intense, not super chill
    [65, 0.70],  //  3 emotional_stability — functional but tense
    [48, 0.70],  //  4 neuroticism — above average anxiety
    [0, 0],      //  5 style_type
    [52, 0.55],  //  6 family_orientation — eventual goal, not priority
    [55, 0.60],  //  7 party_orientation — selective social
    [85, 0.80],  //  8 luxury_orientation — loves the finer things
    [55, 0.55],  //  9 extrovert — slightly extroverted
    [68, 0.65],  // 10 energy_level — driven
    [78, 0.80],  // 11 analytical_tendency — very analytical
    [75, 0.75],  // 12 seriousness — takes things seriously
    [25, 0.55],  // 13 goofiness — rarely silly
    [35, 0.60],  // 14 religiosity — secular-traditional
    [58, 0.65],  // 15 self_awareness — moderate
    [45, 0.50],  // 16 humor — dry humor
    [50, 0.55],  // 17 political_orientation — moderate engagement
    [42, 0.50],  // 18 social_involvement — limited
    [50, 0.55],  // 19 positivity — neutral
    [42, 0.50],  // 20 warmth — reserved
    [45, 0.50],  // 21 openness — somewhat closed
    [18, 0.70],  // 22 childishness — very mature
    [62, 0.65],  // 23 value_rigidity — somewhat rigid
    [35, 0.45],  // 24 loves_animals — indifferent
    [55, 0.45],  // 25 zionism — moderate
    [58, 0.45],  // 26 political_leaning — slight right
    [10, 0.20],  // 27 vegetarianism — no
    [78, 0.70],  // 28 work_ethic — very strong
    [68, 0.65],  // 29 good_kid — follows expectations
    [85, 0.75],  // 30 appearance_sensitivity — very high (internal)
    [42, 0.55],  // 31 bluntness_score — moderately direct
    [15, 0.35],  // 32 toxicity_score — slightly judgmental
    [5, 0.30],   // 33 trollness
    [0, 0],      // 34 sexual_identity
    [0, 0],      // 35 deal_breakers
  ],

  // ── דניאל — THE CREATIVE FREE SPIRIT ──
  // Highest openness, high vibe, strong self-awareness.
  // Low rigidity, low appearance sensitivity. Artistic and deep.
  [
    [80, 0.80],  //  1 cognitive_profile — thoughtful, creative intelligence
    [82, 0.80],  //  2 vibe — very high, free-flowing
    [60, 0.65],  //  3 emotional_stability — functional, occasional intensity
    [38, 0.60],  //  4 neuroticism — some artistic anxiety
    [0, 0],      //  5 style_type
    [48, 0.50],  //  6 family_orientation — not a priority yet
    [68, 0.70],  //  7 party_orientation — social, loves events
    [30, 0.45],  //  8 luxury_orientation — antimaterialist
    [42, 0.55],  //  9 extrovert — more introverted
    [55, 0.55],  // 10 energy_level — bursts of creative energy
    [62, 0.65],  // 11 analytical_tendency — analytical in own way
    [35, 0.50],  // 12 seriousness — light-hearted
    [70, 0.70],  // 13 goofiness — playful and weird
    [18, 0.55],  // 14 religiosity — secular
    [82, 0.85],  // 15 self_awareness — very high
    [78, 0.75],  // 16 humor — great, quirky humor
    [65, 0.65],  // 17 political_orientation — politically engaged
    [68, 0.70],  // 18 social_involvement — community-active
    [68, 0.65],  // 19 positivity — generally positive
    [72, 0.70],  // 20 warmth — warm and genuine
    [92, 0.90],  // 21 openness — defining trait, maximum
    [48, 0.55],  // 22 childishness — youthful spirit
    [22, 0.55],  // 23 value_rigidity — very flexible values
    [62, 0.60],  // 24 loves_animals — likes animals
    [35, 0.40],  // 25 zionism — not very
    [30, 0.40],  // 26 political_leaning — left-leaning
    [55, 0.50],  // 27 vegetarianism — vegetarian-leaning
    [45, 0.45],  // 28 work_ethic — works on passion, not grind
    [32, 0.45],  // 29 good_kid — rebellious streak
    [15, 0.35],  // 30 appearance_sensitivity — very low (internal)
    [28, 0.50],  // 31 bluntness_score — gentle, indirect
    [5, 0.30],   // 32 toxicity_score
    [3, 0.30],   // 33 trollness
    [0, 0],      // 34 sexual_identity
    [0, 0],      // 35 deal_breakers
  ],

  // ── שירה — THE DRIVEN COMPETITOR ──
  // High energy, bluntness, work ethic. Sporty and direct.
  // Moderate warmth, high seriousness. Wants an intellectual equal.
  [
    [75, 0.75],  //  1 cognitive_profile — sharp
    [58, 0.65],  //  2 vibe — focused, less chill
    [72, 0.75],  //  3 emotional_stability — tough exterior
    [32, 0.60],  //  4 neuroticism — handles pressure
    [0, 0],      //  5 style_type
    [52, 0.55],  //  6 family_orientation — moderate, eventual
    [48, 0.55],  //  7 party_orientation — selective socializing
    [58, 0.60],  //  8 luxury_orientation — appreciates quality
    [65, 0.65],  //  9 extrovert — more extroverted
    [90, 0.85],  // 10 energy_level — highest energy
    [65, 0.65],  // 11 analytical_tendency — strategic thinker
    [70, 0.70],  // 12 seriousness — serious about goals
    [38, 0.50],  // 13 goofiness — rare silliness
    [30, 0.60],  // 14 religiosity — secular
    [68, 0.70],  // 15 self_awareness — knows herself
    [55, 0.55],  // 16 humor — witty, sarcastic
    [55, 0.55],  // 17 political_orientation — moderate interest
    [58, 0.60],  // 18 social_involvement — goal-driven social
    [62, 0.60],  // 19 positivity — practical optimist
    [52, 0.55],  // 20 warmth — warm once you earn it
    [62, 0.60],  // 21 openness — open to challenge
    [22, 0.65],  // 22 childishness — mature
    [50, 0.55],  // 23 value_rigidity — moderate
    [45, 0.50],  // 24 loves_animals — neutral
    [58, 0.50],  // 25 zionism — moderate-positive
    [50, 0.45],  // 26 political_leaning — center
    [20, 0.25],  // 27 vegetarianism — no
    [82, 0.75],  // 28 work_ethic — very strong
    [55, 0.55],  // 29 good_kid — follows her own rules
    [58, 0.50],  // 30 appearance_sensitivity (internal)
    [72, 0.70],  // 31 bluntness_score — very direct
    [8, 0.30],   // 32 toxicity_score
    [4, 0.30],   // 33 trollness
    [0, 0],      // 34 sexual_identity
    [0, 0],      // 35 deal_breakers
  ],

  // ── יונתן — THE MATURE FAMILY MAN ──
  // Highest emotional stability, family orientation, animal love.
  // Low party/luxury orientation. Calm, grounded, reliable.
  [
    [68, 0.70],  //  1 cognitive_profile — practical intelligence
    [55, 0.60],  //  2 vibe — steady, calm vibe
    [88, 0.85],  //  3 emotional_stability — rock solid
    [18, 0.80],  //  4 neuroticism — very low
    [0, 0],      //  5 style_type
    [90, 0.90],  //  6 family_orientation — defining value
    [22, 0.55],  //  7 party_orientation — homebody
    [25, 0.45],  //  8 luxury_orientation — simple pleasures
    [38, 0.55],  //  9 extrovert — introverted
    [48, 0.50],  // 10 energy_level — calm energy
    [52, 0.55],  // 11 analytical_tendency — moderate
    [75, 0.75],  // 12 seriousness — serious about life
    [35, 0.50],  // 13 goofiness — dad-joke level
    [45, 0.60],  // 14 religiosity — traditional, not religious
    [78, 0.80],  // 15 self_awareness — strong
    [55, 0.55],  // 16 humor — gentle humor
    [42, 0.50],  // 17 political_orientation — not very political
    [62, 0.60],  // 18 social_involvement — community-oriented
    [65, 0.60],  // 19 positivity — quietly positive
    [80, 0.80],  // 20 warmth — very warm
    [58, 0.60],  // 21 openness — somewhat open
    [15, 0.75],  // 22 childishness — most mature
    [58, 0.60],  // 23 value_rigidity — somewhat traditional
    [95, 0.90],  // 24 loves_animals — highest
    [62, 0.55],  // 25 zionism — moderate-high
    [55, 0.50],  // 26 political_leaning — slight right
    [42, 0.40],  // 27 vegetarianism — considers it
    [65, 0.55],  // 28 work_ethic — solid
    [72, 0.65],  // 29 good_kid — responsible
    [18, 0.30],  // 30 appearance_sensitivity (internal)
    [22, 0.50],  // 31 bluntness_score — gentle
    [3, 0.30],   // 32 toxicity_score
    [2, 0.30],   // 33 trollness
    [0, 0],      // 34 sexual_identity
    [0, 0],      // 35 deal_breakers
  ],

  // ── תמר — THE LAID-BACK OPTIMIST ──
  // Highest humor and vibe. High openness, positivity, low drama.
  // Very flexible, low selectiveness. Dog obsessed.
  [
    [62, 0.60],  //  1 cognitive_profile — clever, not academic
    [85, 0.85],  //  2 vibe — most chill
    [70, 0.70],  //  3 emotional_stability — good
    [25, 0.65],  //  4 neuroticism — low stress
    [0, 0],      //  5 style_type
    [58, 0.60],  //  6 family_orientation — open to it
    [62, 0.65],  //  7 party_orientation — social but casual
    [30, 0.40],  //  8 luxury_orientation — doesn't care
    [60, 0.60],  //  9 extrovert — slightly extroverted
    [72, 0.70],  // 10 energy_level — upbeat
    [38, 0.45],  // 11 analytical_tendency — intuitive
    [35, 0.50],  // 12 seriousness — light
    [78, 0.75],  // 13 goofiness — very silly
    [22, 0.50],  // 14 religiosity — secular
    [62, 0.65],  // 15 self_awareness — decent
    [88, 0.85],  // 16 humor — highest, defining trait
    [32, 0.40],  // 17 political_orientation — disengaged
    [52, 0.50],  // 18 social_involvement — moderate
    [85, 0.80],  // 19 positivity — very positive
    [75, 0.70],  // 20 warmth — warm and friendly
    [80, 0.80],  // 21 openness — very open
    [48, 0.55],  // 22 childishness — youthful
    [25, 0.50],  // 23 value_rigidity — very flexible values
    [90, 0.85],  // 24 loves_animals — obsessed with dogs
    [42, 0.35],  // 25 zionism — doesn't think about it much
    [40, 0.35],  // 26 political_leaning — slight left
    [32, 0.30],  // 27 vegetarianism — open to it
    [50, 0.45],  // 28 work_ethic — does her job, not obsessed
    [48, 0.50],  // 29 good_kid — somewhat
    [20, 0.30],  // 30 appearance_sensitivity (internal)
    [25, 0.50],  // 31 bluntness_score — soft communicator
    [5, 0.30],   // 32 toxicity_score
    [3, 0.30],   // 33 trollness
    [0, 0],      // 34 sexual_identity
    [0, 0],      // 35 deal_breakers
  ],

  // ── עידו — THE TRADITIONAL ACHIEVER ──
  // High work ethic, discipline, value rigidity. Fitness-focused.
  // Conservative values, high appearance sensitivity. Selective.
  [
    [72, 0.75],  //  1 cognitive_profile — practical, focused
    [50, 0.55],  //  2 vibe — controlled
    [75, 0.75],  //  3 emotional_stability — steady
    [28, 0.65],  //  4 neuroticism — low
    [0, 0],      //  5 style_type
    [75, 0.70],  //  6 family_orientation — important
    [40, 0.50],  //  7 party_orientation — social but controlled
    [72, 0.70],  //  8 luxury_orientation — likes nice things
    [55, 0.55],  //  9 extrovert — balanced
    [85, 0.80],  // 10 energy_level — very high (gym, work)
    [55, 0.55],  // 11 analytical_tendency — moderate
    [78, 0.75],  // 12 seriousness — very serious
    [30, 0.50],  // 13 goofiness — rarely silly
    [52, 0.60],  // 14 religiosity — traditional-light
    [52, 0.55],  // 15 self_awareness — moderate
    [48, 0.50],  // 16 humor — basic humor
    [38, 0.45],  // 17 political_orientation — not very engaged
    [38, 0.45],  // 18 social_involvement — limited
    [55, 0.55],  // 19 positivity — practical optimism
    [48, 0.50],  // 20 warmth — reserved warmth
    [42, 0.50],  // 21 openness — somewhat closed
    [20, 0.70],  // 22 childishness — very mature
    [72, 0.70],  // 23 value_rigidity — most rigid values
    [40, 0.45],  // 24 loves_animals — neutral
    [72, 0.60],  // 25 zionism — high
    [68, 0.55],  // 26 political_leaning — right
    [8, 0.20],   // 27 vegetarianism — definitely not
    [88, 0.80],  // 28 work_ethic — highest
    [70, 0.65],  // 29 good_kid — follows the path
    [72, 0.65],  // 30 appearance_sensitivity — high (internal)
    [48, 0.55],  // 31 bluntness_score — moderately direct
    [10, 0.30],  // 32 toxicity_score
    [4, 0.30],   // 33 trollness
    [0, 0],      // 34 sexual_identity
    [0, 0],      // 35 deal_breakers
  ],

  // ── ליאור — THE CULTURED INTELLECTUAL ──
  // High self-awareness, openness, warmth. Arts-loving, emotionally deep.
  // Gay man — gender_expression relevant. Cultured and reflective.
  [
    [82, 0.85],  //  1 cognitive_profile — high, cultured intelligence
    [70, 0.70],  //  2 vibe — sophisticated chill
    [78, 0.80],  //  3 emotional_stability — well-regulated
    [22, 0.75],  //  4 neuroticism — low
    [0, 0],      //  5 style_type
    [52, 0.55],  //  6 family_orientation — open to it
    [62, 0.65],  //  7 party_orientation — cultural events, not clubs
    [78, 0.70],  //  8 luxury_orientation — appreciates aesthetics
    [55, 0.55],  //  9 extrovert — ambivert
    [62, 0.60],  // 10 energy_level — moderate-high
    [65, 0.65],  // 11 analytical_tendency — analytical through arts lens
    [55, 0.55],  // 12 seriousness — balanced
    [52, 0.55],  // 13 goofiness — subtle humor
    [20, 0.55],  // 14 religiosity — secular
    [88, 0.90],  // 15 self_awareness — highest in group
    [78, 0.75],  // 16 humor — witty, clever humor
    [58, 0.60],  // 17 political_orientation — engaged
    [72, 0.70],  // 18 social_involvement — very active community
    [72, 0.65],  // 19 positivity — positive
    [78, 0.75],  // 20 warmth — genuinely warm
    [85, 0.85],  // 21 openness — very high
    [28, 0.60],  // 22 childishness — mature
    [30, 0.55],  // 23 value_rigidity — progressive
    [62, 0.60],  // 24 loves_animals — fond of animals
    [45, 0.40],  // 25 zionism — moderate
    [35, 0.40],  // 26 political_leaning — left-center
    [38, 0.35],  // 27 vegetarianism — flexible
    [62, 0.55],  // 28 work_ethic — dedicated
    [52, 0.50],  // 29 good_kid — mostly
    [55, 0.50],  // 30 appearance_sensitivity (internal)
    [30, 0.50],  // 31 bluntness_score — diplomatic
    [3, 0.30],   // 32 toxicity_score
    [2, 0.30],   // 33 trollness
    [0, 0],      // 34 sexual_identity
    [0, 0],      // 35 deal_breakers
  ],

  // ── רוני — THE QUIRKY NONCONFORMIST ──
  // Highest goofiness, openness to experiences. Lowest rigidity.
  // Gender-fluid preferences, low selectiveness. Philosophy student.
  [
    [72, 0.70],  //  1 cognitive_profile — philosophical mind
    [88, 0.85],  //  2 vibe — highest vibe
    [55, 0.60],  //  3 emotional_stability — functional, emotional
    [42, 0.60],  //  4 neuroticism — some overthinking
    [0, 0],      //  5 style_type
    [40, 0.45],  //  6 family_orientation — not thinking about it
    [78, 0.75],  //  7 party_orientation — loves events and gatherings
    [20, 0.35],  //  8 luxury_orientation — antimaterialist
    [62, 0.65],  //  9 extrovert — extroverted
    [78, 0.75],  // 10 energy_level — high energy, scattered
    [55, 0.55],  // 11 analytical_tendency — philosophical analysis
    [25, 0.50],  // 12 seriousness — least serious
    [85, 0.80],  // 13 goofiness — highest, loves being weird
    [10, 0.45],  // 14 religiosity — very secular
    [65, 0.70],  // 15 self_awareness — knows who she is
    [82, 0.80],  // 16 humor — absurdist humor
    [72, 0.65],  // 17 political_orientation — very engaged
    [65, 0.60],  // 18 social_involvement — activist streak
    [78, 0.70],  // 19 positivity — optimistic rebel
    [68, 0.65],  // 20 warmth — warm, quirky warmth
    [95, 0.90],  // 21 openness — absolute maximum
    [62, 0.65],  // 22 childishness — youthfully playful
    [12, 0.55],  // 23 value_rigidity — lowest rigidity
    [72, 0.70],  // 24 loves_animals — loves animals
    [28, 0.30],  // 25 zionism — low
    [25, 0.35],  // 26 political_leaning — left
    [65, 0.55],  // 27 vegetarianism — mostly vegetarian
    [35, 0.40],  // 28 work_ethic — works to live
    [30, 0.45],  // 29 good_kid — rebellious
    [12, 0.25],  // 30 appearance_sensitivity — lowest (internal)
    [22, 0.50],  // 31 bluntness_score — says it through humor
    [8, 0.30],   // 32 toxicity_score
    [5, 0.30],   // 33 trollness
    [0, 0],      // 34 sexual_identity
    [0, 0],      // 35 deal_breakers
  ],
];

// ── Look trait profiles per user ──────────────────────────────────
// 10 look traits in sort_order:
//  1 initial_attraction_signal  2 height      3 look_style      4 body_type
//  5 skin_color                 6 hair_color  7 eye_color        8 grooming_level
//  9 hair_type                 10 gender_expression
//
// Each entry: [personal_value, confidence, desired_value, weight_for_match]

type LookEntry = [string | null, number, string | null, number];

const lookProfiles: LookEntry[][] = [
  // ── נועה — warm empath: natural look, moderate preferences
  [
    [null, 0, null, 0],                         //  1 initial_attraction_signal (system)
    ["165", 0.95, null, 45],                    //  2 height
    ["natural", 0.80, "casual", 30],            //  3 look_style — prefers casual guys
    ["slim", 0.75, null, 25],                   //  4 body_type
    ["light", 0.85, null, 5],                   //  5 skin_color
    ["dark", 0.80, null, 0],                    //  6 hair_color
    ["dark", 0.80, null, 0],                    //  7 eye_color
    ["medium", 0.65, null, 20],                 //  8 grooming_level
    ["straight", 0.80, null, 5],                //  9 hair_type
    ["feminine", 0.85, "masculine", 35],        // 10 gender_expression
  ],
  // ── אורי — sporty extrovert: athletic build, wants sporty partner
  [
    [null, 0, null, 0],
    ["178", 0.95, null, 25],
    ["sporty", 0.85, "sporty", 55],             //  3 look_style — wants sporty woman
    ["toned", 0.85, "toned", 65],               //  4 body_type — fitness matters
    ["tan", 0.75, null, 5],
    ["dark", 0.80, null, 0],
    ["dark", 0.75, null, 0],
    ["high", 0.75, null, 40],
    ["short", 0.85, null, 5],
    ["masculine", 0.85, "feminine", 50],        // 10 gender_expression
  ],
  // ── מיכל — ambitious perfectionist: polished, high grooming standards
  [
    [null, 0, null, 0],
    ["160", 0.95, null, 85],                    //  2 height — very important to her
    ["elegant", 0.85, "groomed", 75],           //  3 look_style — wants well-dressed men
    ["slim", 0.75, "toned", 80],                //  4 body_type — strong preference
    ["light", 0.85, null, 10],
    ["light_brown", 0.75, null, 0],
    ["light", 0.75, null, 0],
    ["very_high", 0.85, "very_high", 70],       //  8 grooming — wants highly groomed
    ["straight", 0.85, null, 15],
    ["feminine", 0.85, "masculine", 65],        // 10 gender_expression — wants masculine
  ],
  // ── דניאל — creative free spirit: hipster look, doesn't care about partner's appearance
  [
    [null, 0, null, 0],
    ["182", 0.95, null, 15],                    //  2 height — doesn't care
    ["hipster", 0.80, null, 10],                //  3 look_style — no preference
    ["slim", 0.65, null, 10],
    ["light", 0.75, null, 0],
    ["dark", 0.80, null, 0],
    ["dark", 0.75, null, 0],
    ["medium", 0.60, null, 5],                  //  8 grooming — doesn't matter
    ["curly", 0.85, null, 5],
    ["masculine", 0.75, "feminine", 20],        // 10 gender_expression — slight pref
  ],
  // ── שירה — driven competitor: sporty, values fitness in partner
  [
    [null, 0, null, 0],
    ["168", 0.95, null, 55],
    ["sporty", 0.85, "sporty", 65],
    ["toned", 0.85, "toned", 70],              //  4 body_type — partner must be fit
    ["tanned", 0.75, null, 5],
    ["dark", 0.75, null, 0],
    ["dark", 0.75, null, 0],
    ["high", 0.75, "high", 45],                //  8 grooming — takes care of herself
    ["long", 0.80, null, 5],
    ["feminine", 0.80, "masculine", 55],
  ],
  // ── יונתן — mature family man: casual, doesn't care about looks
  [
    [null, 0, null, 0],
    ["175", 0.95, null, 20],
    ["casual", 0.75, null, 10],
    ["toned", 0.60, null, 15],
    ["light", 0.75, null, 0],
    ["dark", 0.80, null, 0],
    ["light", 0.70, null, 0],
    ["medium", 0.55, null, 10],
    ["short", 0.75, null, 5],
    ["masculine", 0.80, "feminine", 30],
  ],
  // ── תמר — laid-back optimist: natural look, very low appearance expectations
  [
    [null, 0, null, 0],
    ["170", 0.95, null, 20],
    ["casual", 0.70, null, 10],                 //  3 look_style — no pref
    ["slim", 0.70, null, 10],
    ["tanned", 0.75, null, 0],
    ["light_brown", 0.70, null, 0],
    ["light", 0.70, null, 0],
    ["medium", 0.55, null, 10],
    ["long", 0.80, null, 5],
    ["feminine", 0.80, null, 10],               // 10 gender_expression — barely matters
  ],
  // ── עידו — traditional achiever: groomed, muscular, wants attractive partner
  [
    [null, 0, null, 0],
    ["185", 0.95, null, 50],
    ["sporty", 0.85, "groomed", 65],            //  3 look_style — wants polished women
    ["muscular", 0.85, "slim", 60],             //  4 body_type — wants slim partner
    ["tan", 0.75, null, 5],
    ["dark", 0.80, null, 0],
    ["dark", 0.75, null, 0],
    ["very_high", 0.85, "high", 55],            //  8 grooming — cares about appearance
    ["short", 0.85, null, 5],
    ["masculine", 0.85, "feminine", 70],        // 10 gender_expression — strong pref
  ],
  // ── ליאור — cultured intellectual: well-groomed, values presentation
  [
    [null, 0, null, 0],
    ["176", 0.95, null, 45],
    ["groomed", 0.85, "groomed", 55],
    ["toned", 0.70, "toned", 55],
    ["tan", 0.70, null, 5],
    ["dark", 0.75, null, 0],
    ["dark", 0.70, null, 0],
    ["very_high", 0.80, "high", 50],
    ["short", 0.80, null, 5],
    ["masculine", 0.75, "masculine", 70],       // 10 gender_expression — wants masculine
  ],
  // ── רוני — quirky nonconformist: natural hipster, lowest appearance requirements
  [
    [null, 0, null, 0],
    ["162", 0.95, null, 10],                    //  2 height — doesn't care at all
    ["hipster", 0.75, null, 5],                 //  3 look_style — no preference
    ["slim", 0.60, null, 5],
    ["light", 0.75, null, 0],
    ["ginger", 0.85, null, 0],
    ["light", 0.80, null, 0],
    ["low", 0.60, null, 5],                     //  8 grooming — doesn't care
    ["curly", 0.85, null, 5],
    ["androgynous", 0.70, null, 5],             // 10 gender_expression — open to all
  ],
];

// ── Insert everything in a transaction ──────────────────────────

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

const insertProfile = db.prepare(`
  INSERT INTO profiles (user_id, raw_answer, analysis_json) VALUES (?, ?, ?)
`);

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

// Get all trait definition IDs in sort order (with their default weights)
const traitDefs = db
  .prepare("SELECT id, weight FROM trait_definitions ORDER BY sort_order")
  .all() as { id: number; weight: number }[];

const lookTraitDefs = db
  .prepare("SELECT id FROM look_trait_definitions ORDER BY sort_order")
  .all() as { id: number }[];

console.log(`Found ${traitDefs.length} trait definitions, ${lookTraitDefs.length} look trait definitions.\n`);

db.transaction(() => {
  for (let i = 0; i < users.length; i++) {
    const u = users[i];

    // Insert user with all fields populated
    const row = insertUser.get(
      u.first_name, u.email, u.age, u.gender, u.looking_for_gender,
      u.city, u.height, JSON.stringify(u.self_style),
      u.desired_age_min, u.desired_age_max, u.age_flexibility,
      u.desired_height_min, u.desired_height_max, u.height_flexibility,
      u.desired_location_range,
      u.pickiness_score, u.initial_attraction_signal,
    ) as { id: number };
    const userId = row.id;

    // Insert chat profile with analysis JSON
    const tp = traitProfiles[i];
    const simpleAnalysis = {
      intelligence_score: Math.round(tp[0][0] / 10),          // cognitive_profile / 10
      emotional_depth_score: Math.round(tp[2][0] / 10),       // emotional_stability / 10
      social_style: tp[8][0] > 60 ? "extroverted" : tp[8][0] < 45 ? "introverted" : "balanced",
      relationship_goal: tp[5][0] > 65 ? "serious" : tp[5][0] < 45 ? "casual" : "unsure",
    };
    insertProfile.run(userId, chatAnswers[i], JSON.stringify(simpleAnalysis));

    // Insert personality traits (all 35)
    for (let t = 0; t < traitDefs.length && t < tp.length; t++) {
      const entry = tp[t];
      const score = entry[0];
      const confidence = entry[1];
      const weightOverride = entry.length > 2 ? entry[2] : traitDefs[t].weight;

      // Skip empty placeholder traits (score=0 AND confidence=0)
      if (score === 0 && confidence === 0) continue;

      // weight_confidence derived from trait confidence (slightly lower)
      const weightConfidence = Math.max(0.3, confidence - 0.15);

      insertUserTrait.run(
        userId, traitDefs[t].id,
        score, confidence,
        weightOverride, weightConfidence,
      );
    }

    // Insert look traits (all 10)
    for (let lt = 0; lt < lookTraitDefs.length && lt < lookProfiles[i].length; lt++) {
      const [personalValue, pConf, desiredValue, weight] = lookProfiles[i][lt];

      // Skip rows with no data at all
      if (!personalValue && !desiredValue) continue;

      // desired_value_confidence derived from personal_value_confidence
      const desiredConf = desiredValue ? Math.max(0.4, pConf - 0.1) : null;
      const weightConf = Math.max(0.3, pConf - 0.15);

      insertUserLookTrait.run(
        userId, lookTraitDefs[lt].id,
        personalValue, pConf,
        desiredValue, desiredConf,
        weight, weightConf,
      );
    }

    console.log(`  ✓ ${u.first_name} (ID ${userId}) — ${u.gender}, age ${u.age}, ${u.city}`);
  }
})();

// ── Verification ────────────────────────────────────────────────

const userCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE email LIKE '%@matchme-seed.test'").get() as any).c;
const traitCount = (db.prepare("SELECT COUNT(*) as c FROM user_traits WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@matchme-seed.test')").get() as any).c;
const lookCount = (db.prepare("SELECT COUNT(*) as c FROM user_look_traits WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@matchme-seed.test')").get() as any).c;
const profileCount = (db.prepare("SELECT COUNT(*) as c FROM profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@matchme-seed.test')").get() as any).c;

console.log(`
✅ Seed complete!
   Users:       ${userCount}
   Traits:      ${traitCount} (personality scores across all users)
   Look traits: ${lookCount} (physical trait values across all users)
   Profiles:    ${profileCount} (chat answers + AI analysis)
   All users marked: is_matchable=1, is_real_user=0, valid_person=1
`);
