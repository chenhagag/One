/**
 * Import / sync trait definitions from the Excel spec.
 * Run: npx ts-node src/importExcel.ts
 *
 * - Updates existing rows by internal_name (preserves IDs)
 * - Inserts new rows if not found
 * - Skips rows marked as not-MVP
 * - External traits: only imports rows with source = "AI"
 */

import XLSX from "xlsx";
import path from "path";
import db from "./db";

const EXCEL_PATH = path.join(__dirname, "../../Docs/MatchMe DB.xlsx");

// ── Mapping from Excel internal_name to our stable DB internal_name ──
// The Excel uses inconsistent names. This maps them to our canonical names.
const INTERNAL_NAME_MAP: Record<string, string> = {
  "IQ": "cognitive_profile",
  "Eq": "eq",
  "EQ": "eq",
  "Mainsteemness": "vibe",
  "emotional_stability": "emotional_stability",
  "family_orientation": "family_orientation",
  "party_orientation": "party_orientation",
  "FunImportance": "fun_importance",
  "extovert": "extrovert",
  "energy_level": "energy_level",
  "analytical_tendency": "analytical_tendency",
  "Seriousness": "seriousness",
  "Religiosity": "religiosity",
  "self_awareness": "self_awareness",
  "Humor": "humor",
  "political_orientation": "political_orientation",
  "social_involvement": "social_involvement",
  "Positivity": "positivity",
  "Warmth": "warmth",
  "openness": "openness",
  "Childishness": "childishness",
  "value_rigidity": "value_rigidity",
  "loves_animals": "loves_animals",
  "bluntness_score": "bluntness_score",
  "toxicity_score": "toxicity_score",
  "trollness": "trollness",
  "SexuallIdentity": "sexual_identity",
  "DealBrakers": "deal_breakers",
  "appearance_sensitivity": "appearance_sensitivity",
  // External
  "BodyType": "body_type",
  "SkinColor": "skin_color",
  "HairColor": "hair_color",
  "EyeColor": "eye_color",
  "HairType": "hair_type",
  "GenderMatched": "gender_expression",
  "initial_attraction_signal": "initial_attraction_signal",
  "Height": "height",
};

// Map Hebrew display names to internal_names for rows where Excel has no internal_name
const DISPLAY_NAME_MAP: Record<string, string> = {
  '"ילד טוב"': "good_kid",
  'גיקיות': "nerdiness",
  'יוקרה תעסוקתית': "career_prestige",
  'אינטלקטואליות': "intellectualism",
  'יתרונות אפשריים': "advantages",
  'אהבת הארץ וציונות': "zionism",
  'ימניות/שמאלניות': "political_leaning",
  'צמחונות': "vegetarianism",
  'מוסר עבודה': "work_ethic",
  'היפסטריות': "hipsterishness",
  'סגנון תל אביבי': "tel_aviv_style",
  'עממיות': "mainstream_style",
  'היפיות': "hippie_style",
  'סגנון סובייטי': "soviet_style",
};

// Traits explicitly NOT in MVP (from Excel note)
const NOT_MVP = new Set(["StyleType"]);

function resolveInternalName(excelName: string | null, displayNameHe: string): string | null {
  // Try display name map first
  if (DISPLAY_NAME_MAP[displayNameHe]) return DISPLAY_NAME_MAP[displayNameHe];

  if (!excelName) {
    // Try to find by display name in existing DB
    const existing = db.prepare("SELECT internal_name FROM trait_definitions WHERE display_name_he = ?").get(displayNameHe) as any;
    if (existing) return existing.internal_name;
    return null;
  }
  return INTERNAL_NAME_MAP[excelName] || excelName.toLowerCase().replace(/\s+/g, "_");
}

function importInternalTraits() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets["מאפיינים - כללי"];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  // Headers at row index 3
  // Data starts at row index 4, stops when we hit the "not in MVP" marker
  const upsert = db.prepare(`
    UPDATE trait_definitions SET
      display_name_he = ?, ai_description = ?, required_confidence = ?,
      weight = ?, trait_group = ?
    WHERE internal_name = ?
  `);

  const insert = db.prepare(`
    INSERT INTO trait_definitions
      (internal_name, display_name_he, display_name_en, ai_description, required_confidence, weight, sensitivity, calc_type, trait_group, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  let sortOrder = 0;
  let updated = 0, inserted = 0, skipped = 0;
  const excelTraitNames = new Set<string>();

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    const displayHe = String(row[0]).trim();

    // Stop at "not in MVP" marker
    if (displayHe.includes("לא נכנסו") || displayHe.includes("MVP")) break;

    const excelName = row[1] ? String(row[1]).trim() : null;
    if (excelName && NOT_MVP.has(excelName)) { skipped++; continue; }

    const internalName = resolveInternalName(excelName, displayHe);
    if (!internalName) {
      console.log(`  SKIP (no internal_name): "${displayHe}"`);
      skipped++;
      continue;
    }

    const group = row[2] ? String(row[2]).trim() : null;
    const aiDesc = row[3] ? String(row[3]).trim() : null;
    const reqConf = typeof row[4] === "number" ? row[4] : 0.5;
    const weight = typeof row[5] === "number" ? row[5] : 0;
    sortOrder++;

    // Check if exists
    const existing = db.prepare("SELECT id FROM trait_definitions WHERE internal_name = ?").get(internalName) as any;

    if (existing) {
      upsert.run(displayHe, aiDesc, reqConf, weight, group, internalName);
      updated++;
      console.log(`  UPDATE: ${internalName} (group=${group}, weight=${weight}, req_conf=${reqConf})`);
    } else {
      // Determine calc_type from Excel or trait name
      const excelCalcType = row[7] ? String(row[7]).trim() : "";
      let calcType = "normal";
      if (["deal_breakers", "advantages"].includes(internalName)) calcType = "text";
      else if (excelCalcType.includes("שימוש פנימי") || excelCalcType.includes("internal")) calcType = "internal_use";
      else if (["toxicity_score", "trollness", "sexual_identity", "appearance_sensitivity"].includes(internalName)) calcType = "internal_use";

      const excelSensitivity = row[6] ? String(row[6]).trim() : "";
      const sensitivity = excelSensitivity.includes("רגיש") || ["toxicity_score", "trollness", "sexual_identity", "value_rigidity", "appearance_sensitivity", "career_prestige"].includes(internalName)
        ? "sensitive" : "normal";

      insert.run(internalName, displayHe, internalName.replace(/_/g, " "), aiDesc, reqConf, weight, sensitivity, calcType, group, sortOrder);
      inserted++;
      console.log(`  INSERT: ${internalName} (group=${group}, weight=${weight}, calc=${calcType})`);
    }

    excelTraitNames.add(internalName);
  }

  // Delete traits that are in DB but NOT in Excel (removed from MVP)
  const dbTraits = db.prepare("SELECT id, internal_name FROM trait_definitions WHERE is_active = 1").all() as { id: number; internal_name: string }[];
  let deleted = 0;
  for (const t of dbTraits) {
    if (!excelTraitNames.has(t.internal_name)) {
      // Delete user_traits referencing this definition first
      const delUserTraits = db.prepare("DELETE FROM user_traits WHERE trait_definition_id = ?").run(t.id);
      db.prepare("DELETE FROM trait_definitions WHERE id = ?").run(t.id);
      deleted++;
      console.log(`  DELETE: ${t.internal_name} (id=${t.id}, ${delUserTraits.changes} user_traits removed)`);
    }
  }

  console.log(`Internal traits: ${updated} updated, ${inserted} inserted, ${deleted} deleted, ${skipped} skipped`);
}

function importExternalTraits() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets["מאפיינים חיצוניים - כללי"];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  // Headers at row index 1
  // Data starts at row index 2
  const upsert = db.prepare(`
    UPDATE look_trait_definitions SET
      display_name_he = ?, ai_description = ?, required_confidence = ?,
      weight = ?, possible_values = ?, sensitivity = ?
    WHERE internal_name = ?
  `);

  const insert = db.prepare(`
    INSERT INTO look_trait_definitions
      (internal_name, display_name_he, display_name_en, source, weight, sensitivity, possible_values, ai_description, required_confidence, sort_order, is_active)
    VALUES (?, ?, ?, 'ai', ?, ?, ?, ?, ?, ?, 1)
  `);

  let sortOrder = 0;
  let updated = 0, inserted = 0, skipped = 0;

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    const displayHe = String(row[0]).trim();
    const excelName = row[1] ? String(row[1]).trim() : null;
    const source = row[2] ? String(row[2]).trim() : "";

    // Only import AI-sourced traits
    if (source.toLowerCase() !== "ai") {
      skipped++;
      continue;
    }

    let internalName = excelName ? (INTERNAL_NAME_MAP[excelName] || excelName.toLowerCase().replace(/\s+/g, "_")) : null;
    if (!internalName) {
      // Try by display name in DB
      const existing = db.prepare("SELECT internal_name FROM look_trait_definitions WHERE display_name_he = ?").get(displayHe) as any;
      if (existing) {
        internalName = existing.internal_name;
      } else {
        console.log(`  SKIP external (no internal_name): "${displayHe}"`);
        skipped++;
        continue;
      }
    }

    const aiDesc = row[3] ? String(row[3]).trim() : null;
    const reqConf = typeof row[4] === "number" ? row[4] : 0.5;
    const weight = typeof row[5] === "number" ? row[5] : 0;
    const sensitivity = row[6] ? String(row[6]).trim() : "normal";
    const possibleValuesRaw = row[10] ? String(row[10]).trim() : null;
    sortOrder++;

    // Parse possible values from Hebrew comma/slash-separated to JSON array
    let possibleValuesJson: string | null = null;
    if (possibleValuesRaw) {
      // Split on comma, period, or slash (for values like "כהה / בהיר")
      let values = possibleValuesRaw.split(/[,،.\/]+/).map(v => v.trim()).filter(Boolean);
      // Filter out descriptive prefixes (e.g. "ערכים אפשריים - ...")
      values = values.filter(v => !v.startsWith("ערכים אפשריים"));
      if (values.length > 0) possibleValuesJson = JSON.stringify(values);
    }

    // Override specific traits where Excel values are descriptions, not clean lists
    if (internalName === "gender_expression") {
      possibleValuesJson = JSON.stringify(["נשי", "גברי", "אנדרוגיני"]);
    }

    const sensitivityNorm = sensitivity.includes("רגיש") ? "sensitive" : "normal";

    const existing = db.prepare("SELECT id FROM look_trait_definitions WHERE internal_name = ?").get(internalName) as any;

    if (existing) {
      upsert.run(displayHe, aiDesc, reqConf, weight, possibleValuesJson, sensitivityNorm, internalName);
      updated++;
      console.log(`  UPDATE external: ${internalName} (weight=${weight}, values=${possibleValuesJson})`);
    } else {
      insert.run(internalName, displayHe, internalName!.replace(/_/g, " "), weight, sensitivityNorm, possibleValuesJson, aiDesc, reqConf, sortOrder);
      inserted++;
      console.log(`  INSERT external: ${internalName} (weight=${weight})`);
    }
  }

  console.log(`External traits: ${updated} updated, ${inserted} inserted, ${skipped} skipped`);
}

// ── Run ──────────────────────────────────────────────────────────

console.log("Importing trait definitions from Excel...\n");
console.log("=== Internal Traits ===");
importInternalTraits();
console.log("\n=== External Traits ===");
importExternalTraits();
console.log("\nDone.");
