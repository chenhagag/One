/**
 * Seed definition/config tables with initial data from the Excel spec.
 * This runs on every server start but is idempotent (INSERT OR IGNORE).
 */

import Database from "better-sqlite3";

export function seedDefinitions(db: Database.Database) {
  // Only seed if tables are empty
  const traitCount = (db.prepare("SELECT COUNT(*) as c FROM trait_definitions").get() as any).c;
  if (traitCount > 0) return; // Already seeded

  const insertTrait = db.prepare(`
    INSERT OR IGNORE INTO trait_definitions
    (internal_name, display_name_he, display_name_en, ai_description, required_confidence, weight, sensitivity, calc_type, default_filter_range, personal_filter_desc, notes, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLookTrait = db.prepare(`
    INSERT OR IGNORE INTO look_trait_definitions
    (internal_name, display_name_he, display_name_en, source, weight, sensitivity, filter_range, possible_values, notes, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEnum = db.prepare(`
    INSERT OR IGNORE INTO enum_options (category, value, label_he, label_en, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertConfig = db.prepare(`
    INSERT OR IGNORE INTO config (key, value, description, category)
    VALUES (?, ?, ?, ?)
  `);

  // ── TRAIT DEFINITIONS (from "מאפיינים - כללי") ──────────────────
  const traits = [
    ["cognitive_profile", "פרופיל קוגניטיבי", "Cognitive Profile", "General cognitive measure — vocabulary, reasoning complexity", 0.7, 10, "sensitive", "normal", 15, "Above user or up to -10", null, 1],
    ["vibe", "סחיות", "Vibe", "How chill and easygoing the user is", 0.6, 7, "normal", "normal", null, "Up to 20 below/above", null, 2],
    ["emotional_stability", "יציבות רגשית", "Emotional Stability", "General emotional stability and regulation", 0.7, 8, "normal", "normal", null, "Up to 15 below/above", null, 3],
    ["neuroticism", "נוירוטיות", "Neuroticism", "Tendency toward anxiety, drama, overthinking", 0.7, 8, "normal", "normal", null, null, null, 4],
    ["style_type", "סגנון כללי", "Style Type", "General style type: eres, hippy, nerd, sporty, etc.", 0.7, 8, "normal", "special", null, "Per type compatibility table", "Filters incompatible types", 5],
    ["family_orientation", "משפחתיות", "Family Orientation", "Importance of family and family life", 0.6, 6, "safe_output", "normal", null, "Up to 20 below/above", null, 6],
    ["party_orientation", "נהנתנות בליינית", "Party Orientation", "Love of going out, parties, nightlife", 0.6, 6, "normal", "normal", null, "Up to 20 below/above", null, 7],
    ["luxury_orientation", "נהנתנות יוקרתית", "Luxury Orientation", "Love of luxury, comfort, high-end lifestyle", 0.5, 5, "normal", "normal", null, null, null, 8],
    ["extrovert", "מופנמות/מוחצנות", "Introversion/Extroversion", "Where user falls on introvert–extrovert spectrum", 0.4, 2, "normal", "normal", null, null, null, 9],
    ["energy_level", "אנרגטיות", "Energy Level", "General energy and activity level", 0.5, 4, "normal", "normal", null, null, null, 10],
    ["analytical_tendency", "אנליטיות", "Analytical Tendency", "Tendency toward analytical, logical thinking", 0.5, 3, "normal", "normal", null, null, null, 11],
    ["seriousness", "רצינות", "Seriousness", "Overall seriousness about life", 0.6, 5, "normal", "normal", null, null, null, 12],
    ["goofiness", "שטותניקיות", "Goofiness", "Physical humor, silliness, playfulness", 0.6, 5, "normal", "normal", null, null, null, 13],
    ["religiosity", "דתיות/חילוניות", "Religiosity", "Level of religious observance and belief", 0.7, 6, "normal", "normal", null, "Up to 20 below/above", "May refine later", 14],
    ["self_awareness", "מודעות עצמית", "Self Awareness", "Level of self-awareness and introspection", 0.7, 9, "normal", "normal", null, null, null, 15],
    ["humor", "הומור", "Humor", "Sense of humor and lightness", 0.5, 4, "normal", "normal", null, null, "AI may not detect well", 16],
    ["political_orientation", "פוליטיות", "Political Orientation", "Level of political involvement and leaning", 0.6, 4, "normal", "normal", null, null, null, 17],
    ["social_involvement", "מעורבות חברתית", "Social Involvement", "Community and social engagement", 0.6, 4, "safe_output", "normal", null, null, null, 18],
    ["positivity", "חיוביות", "Positivity", "Positive attitude and optimism", 0.5, 3, "normal", "normal", null, null, null, 19],
    ["warmth", "לבביות", "Warmth", "Human warmth and caring nature", 0.5, 3, "safe_output", "normal", null, null, null, 20],
    ["openness", "פתיחות", "Openness", "Openness to new ideas and experiences", 0.6, 6, "safe_output", "normal", null, null, null, 21],
    ["childishness", "ילדותיות", "Childishness", "Childishness vs maturity", 0.6, 7, "normal", "normal", null, null, null, 22],
    ["value_rigidity", "שמרנות ערכית", "Value Rigidity", "Conservatism and rigidity in values", 0.6, 7, "sensitive", "normal", null, "Score += 20", null, 23],
    ["loves_animals", "אהבה לבעלי חיים", "Loves Animals", "Love and care for animals", 0.6, 5, "safe_output", "normal", null, null, null, 24],
    ["zionism", "אהבת הארץ וציונות", "Zionism", "Love of country, Zionist sentiment", 0.3, 3, "normal", "normal", null, null, null, 25],
    ["political_leaning", "ימניות/שמאלניות", "Political Leaning", "Political left/right orientation", 0.4, 4, "normal", "normal", null, null, null, 26],
    ["vegetarianism", "צמחונות", "Vegetarianism", "Vegetarian/vegan tendencies", 0.2, 2, "normal", "normal", null, null, null, 27],
    ["work_ethic", "מוסר עבודה", "Work Ethic", "Dedication and discipline in work", 0.2, 2, "normal", "normal", null, null, null, 28],
    ["good_kid", "ילד טוב", "Good Kid", "How much user follows rules and expectations", 0.5, 4, "normal", "normal", null, null, null, 29],
    ["appearance_sensitivity", "רגישות למראה", "Appearance Sensitivity", "How much appearance matters to this person", 0.2, 0, "sensitive", "internal_use", null, null, null, 30],
    ["bluntness_score", "בוטות", "Bluntness", "Directness and bluntness in communication", 0.6, 4, "sensitive", "normal", null, null, null, 31],
    ["toxicity_score", "רעילות", "Toxicity", "Detection of toxic or harmful behavior", 0.4, 0, "sensitive", "internal_use", null, null, null, 32],
    ["trollness", "האם טרול?", "Trollness", "Detection of trolling behavior", 0.4, 0, "sensitive", "internal_use", null, null, null, 33],
    ["sexual_identity", "זהויות מיניות שונות", "Sexual Identity", "Trans/non-binary identity", 0.4, 0, "sensitive", "filter", null, null, "Only match same identity or 'doesn't matter'", 34],
    ["deal_breakers", "דיל ברייקרס אפשריים", "Deal Breakers", "Potential deal breakers (e.g. lives with parents)", 0.1, 0, "sensitive", "internal_use", null, null, null, 35],
  ];

  // ── LOOK TRAIT DEFINITIONS (from "מאפיינים חיצוניים - כללי") ────
  const lookTraits = [
    ["initial_attraction_signal", "שיעור אישור", "Attraction Signal", "system", 0, "sensitive", null, null, "Calculated from user ratings", 1],
    ["height", "גובה", "Height", "form", 80, "normal", "Man > Woman for straights", null, "Special calc if important to user", 2],
    ["look_style", "סגנון מראה", "Look Style", "form_ai", 0, "normal", null, '["sporty","groomed","casual","elegant","hipster","natural"]', null, 3],
    ["body_type", "מבנה גוף", "Body Type", "ai", 90, "sensitive", null, '["muscular","slim","toned","chubby","fat"]', "Can filter if critical to user", 4],
    ["skin_color", "צבע עור", "Skin Color", "ai", 10, "normal", null, '["dark","tan","tanned","light"]', null, 5],
    ["hair_color", "צבע שיער", "Hair Color", "ai", 0, "normal", null, '["blonde","dark","light_brown","ginger"]', null, 6],
    ["eye_color", "צבע עיניים", "Eye Color", "ai", 0, "normal", null, '["dark","light"]', null, 7],
    ["grooming_level", "מידת טיפוח", "Grooming Level", "ai", 50, "sensitive", null, '["very_high","high","medium","low"]', null, 8],
    ["hair_type", "סוג שיער", "Hair Type", "ai", 60, "normal", null, '["bald","curly","straight","short","long"]', null, 9],
    ["gender_expression", "נשיות / גבריות", "Gender Expression", "ai", 80, "sensitive", null, '["feminine","masculine","androgynous"]', "Relevant mainly for gay matches", 10],
  ];

  // ── ENUM OPTIONS ────────────────────────────────────────────────
  const enums = [
    // Gender
    ["gender", "man", "גבר", "Man", 1],
    ["gender", "woman", "אישה", "Woman", 2],
    ["gender", "undefined", "לא מוגדר", "Undefined", 3],

    // Looking for gender
    ["looking_for_gender", "man", "גבר", "Man", 1],
    ["looking_for_gender", "woman", "אישה", "Woman", 2],
    ["looking_for_gender", "both", "שניהם", "Both", 3],
    ["looking_for_gender", "doesnt_matter", "לא משנה", "Doesn't matter", 4],

    // Look styles (multi-select)
    ["look_style", "sporty", "ספורטיבי", "Sporty", 1],
    ["look_style", "groomed", "מטופח", "Groomed", 2],
    ["look_style", "casual", "קז'ואל", "Casual", 3],
    ["look_style", "elegant", "אלגנטי", "Elegant", 4],
    ["look_style", "hipster", "היפסטר", "Hipster", 5],
    ["look_style", "natural", "טבעי", "Natural", 6],

    // Age flexibility
    ["flexibility", "not_flexible", "לא גמיש", "Not flexible", 1],
    ["flexibility", "slightly_flexible", "קצת גמיש", "Slightly flexible", 2],
    ["flexibility", "very_flexible", "מאוד גמיש", "Very flexible", 3],

    // Location range
    ["location_range", "my_city", "העיר שלי בלבד", "My city only", 1],
    ["location_range", "my_area", "האזור שלי", "My area", 2],
    ["location_range", "bit_further", "קצת רחוק יותר", "A bit further", 3],
    ["location_range", "whole_country", "כל הארץ", "Whole country", 4],

    // User status
    ["user_status", "waiting_match", "ממתין לשידוך", "Waiting for match", 1],
    ["user_status", "in_match", "בשידוך", "In match", 2],
    ["user_status", "frozen", "מוקפא", "Frozen", 3],
    ["user_status", "waiting_payment", "ממתין לתשלום", "Waiting for payment", 4],

    // Match status
    ["match_status", "pending", "ממתין", "Pending", 1],
    ["match_status", "waiting_first_rating", "ממתין לדירוג ראשון", "Waiting for first rating", 2],
    ["match_status", "waiting_second_rating", "ממתין לדירוג שני", "Waiting for second rating", 3],
    ["match_status", "approved", "אושר", "Approved", 4],
    ["match_status", "rejected", "נדחה", "Rejected", 5],
    ["match_status", "in_match", "בשידוך", "In match", 6],
    ["match_status", "cancelled", "בוטל", "Cancelled", 7],

    // Subscription
    ["subscription", "free", "חינמי", "Free", 1],
    ["subscription", "basic", "בסיסי", "Basic", 2],
    ["subscription", "premium", "פרימיום", "Premium", 3],

    // Style types (for trait matching)
    ["style_type", "eres", "ארס", "Eres", 1],
    ["style_type", "hippy", "היפי", "Hippy", 2],
    ["style_type", "nerd", "נרד", "Nerd", 3],
    ["style_type", "sporty", "ספורטיבי", "Sporty", 4],
    ["style_type", "mainstream", "מיינסטרים", "Mainstream", 5],
    ["style_type", "artistic", "אומנותי", "Artistic", 6],
  ];

  // ── CONFIG ──────────────────────────────────────────────────────
  const configs = [
    ["scoring.internal_weight", "0.8", "Internal (personality) score weight in final match score", "scoring"],
    ["scoring.external_weight", "0.2", "External (appearance) score weight in final match score", "scoring"],
    ["scoring.approval_rate_bonus", "30", "Bonus points added for initial_attraction_signal", "scoring"],
    ["scoring.approval_confidence_threshold", "30", "Number of ratings needed for full confidence", "scoring"],
    ["scoring.photo_confidence_weight", "0.3", "Weight of photo confidence in approval score", "scoring"],
    ["scoring.count_confidence_weight", "0.7", "Weight of rating count confidence in approval score", "scoring"],
    ["matching.max_active_matches", "3", "Maximum concurrent active matches per user", "matching"],
    ["matching.min_match_score", "50", "Minimum score to consider a match", "matching"],
    ["matching.good_match_threshold", "70", "Score threshold for a 'good' match", "matching"],
    ["filter.age_tolerance_not_flexible", "1", "Age tolerance in years for not_flexible", "matching"],
    ["filter.age_tolerance_slightly", "3", "Age tolerance in years for slightly_flexible", "matching"],
    ["filter.age_tolerance_very", "5", "Age tolerance in years for very_flexible", "matching"],
    ["filter.height_tolerance_not_flexible", "2", "Height tolerance in cm for not_flexible", "matching"],
    ["filter.height_tolerance_slightly", "5", "Height tolerance in cm for slightly_flexible", "matching"],
    ["filter.height_tolerance_very", "10", "Height tolerance in cm for very_flexible", "matching"],
    ["filter.weight_threshold_for_filter", "80", "If trait weight > this, trait becomes a hard filter", "matching"],
    ["system.country", "Israel", "Current operating country", "system"],
    ["system.readiness_formula", "has_profile AND has_traits AND valid_person AND status=waiting_match", "Formula for is_matchable calculation (reference only)", "system"],
  ];

  // Run all inserts in a transaction for performance
  db.transaction(() => {
    for (const t of traits) {
      insertTrait.run(...t);
    }
    for (const lt of lookTraits) {
      insertLookTrait.run(...lt);
    }
    for (const e of enums) {
      insertEnum.run(...e);
    }
    for (const c of configs) {
      insertConfig.run(...c);
    }
  })();
}
