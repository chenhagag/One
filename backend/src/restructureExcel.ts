/**
 * Restructure the Excel internal traits sheet:
 * Split the AI explanation column into 7 structured columns.
 * Run: npx ts-node src/restructureExcel.ts
 */
import XLSX from "xlsx";
import path from "path";

const EXCEL_PATH = path.join(__dirname, "../../Docs/MatchMe DB.xlsx");

// ── Parse a trait description into structured parts ────────────

interface StructuredGuidance {
  general_explanation: string;     // הסבר כללי
  what_it_measures: string;        // מה התכונה מודדת
  valid_signals: string;           // מה כן נחשב סיגנל
  what_not_to_infer: string;       // מה לא להסיק
  score_scale: string;             // סקאלת ציונים
  partner_weight_guidance: string; // איך להעריך משקל אצל הצד השני
  special_notes: string;           // הערות מיוחדות / כללי זהירות
}

function parseDescription(text: string): StructuredGuidance {
  if (!text) return { general_explanation: "", what_it_measures: "", valid_signals: "", what_not_to_infer: "", score_scale: "", partner_weight_guidance: "", special_notes: "" };

  const result: StructuredGuidance = {
    general_explanation: "",
    what_it_measures: "",
    valid_signals: "",
    what_not_to_infer: "",
    score_scale: "",
    partner_weight_guidance: "",
    special_notes: "",
  };

  // Split by section markers
  const sections = text.split(/---+/).map(s => s.trim()).filter(Boolean);

  for (const section of sections) {
    const lower = section.toLowerCase();

    // General explanation / purpose
    if (lower.includes("מטרת התכונה") || (sections.indexOf(section) === 0 && !lower.includes("איך להעריך"))) {
      // Extract purpose
      const purposeMatch = section.match(/מטרת התכונה:\s*([\s\S]*?)(?=\n\n|$)/);
      if (purposeMatch) {
        result.what_it_measures = purposeMatch[1].trim();
      }
      // First sentence before "מטרת התכונה" is general explanation
      const firstLine = section.split(/מטרת התכונה/)[0].trim();
      if (firstLine && firstLine.length > 5) {
        result.general_explanation = firstLine;
      }
      // If no separate general explanation, use the purpose
      if (!result.general_explanation && result.what_it_measures) {
        result.general_explanation = result.what_it_measures.split(".")[0] + ".";
      }
    }

    // How to evaluate → valid signals
    if (lower.includes("איך להעריך") || lower.includes("התבסס על")) {
      const lines = section.split("\n")
        .filter(l => l.trim().startsWith("-") || l.trim().startsWith("•"))
        .map(l => l.trim())
        .join("\n");
      if (lines) result.valid_signals = lines;
    }

    // What NOT to infer
    if (lower.includes("הבחנ") || lower.includes("לא למדוד") || lower.includes("אין להתייחס") || lower.includes("שים לב")) {
      const distinctions = section.split("\n")
        .filter(l => l.trim().startsWith("-") || l.trim().startsWith("•") || l.includes("≠") || l.includes("לא "))
        .map(l => l.trim())
        .join("\n");
      if (distinctions) {
        result.what_not_to_infer = (result.what_not_to_infer ? result.what_not_to_infer + "\n" : "") + distinctions;
      }
    }

    // Score scale
    if (lower.includes("סקאלה") || lower.includes("סקאלת") || (lower.includes("0–20") || lower.includes("0-20"))) {
      result.score_scale = section.replace(/סקאלה.*?:\s*/i, "").trim();
    }

    // Partner weight guidance
    if (lower.includes("משקל") && (lower.includes("בן זוג") || lower.includes("בת זוג") || lower.includes("צד השני") || lower.includes("weight_for_match"))) {
      result.partner_weight_guidance = section.replace(/.*משקל.*?:\s*/i, "").trim();
    }

    // Special notes / warnings
    if (lower.includes("זהירות") || lower.includes("הערה") || lower.includes("חשוב מאוד") || lower.includes("שים לב במיוחד")) {
      const noteContent = section.trim();
      if (noteContent.length > 10 && noteContent.length < 500) {
        result.special_notes = (result.special_notes ? result.special_notes + "\n" : "") + noteContent;
      }
    }
  }

  // Fallback: if we couldn't parse well, put the whole text in general_explanation
  if (!result.general_explanation && !result.what_it_measures) {
    result.general_explanation = text.slice(0, 200);
  }

  // Also check for "not to infer" patterns in the first section
  const notInferPatterns = text.match(/אין להתייחס ל[^\n]+/g);
  if (notInferPatterns && !result.what_not_to_infer) {
    result.what_not_to_infer = notInferPatterns.join("\n");
  }

  return result;
}

// ── Main ───────────────────────────────────────────────────────

const wb = XLSX.readFile(EXCEL_PATH);
const ws = wb.Sheets["מאפיינים - כללי"];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

// The current header is at row index 3
const headerRow = data[3];
console.log("Current headers:", JSON.stringify(headerRow));

// Find the AI explanation column index (column D = index 3)
const aiColIdx = 3;

// New columns to insert after the AI explanation column
const newHeaders = [
  "הסבר כללי",
  "מה התכונה מודדת",
  "מה כן נחשב סיגנל",
  "מה לא להסיק",
  "סקאלת ציונים",
  "איך להעריך משקל אצל הצד השני",
  "הערות מיוחדות / כללי זהירות",
];

// Insert new column headers after the AI explanation column
// Shift all existing columns after aiColIdx to the right by 7
const newData: any[][] = [];

for (let i = 0; i < data.length; i++) {
  const row = data[i] || [];
  const newRow: any[] = [];

  if (i === 3) {
    // Header row — insert new column names
    for (let c = 0; c <= aiColIdx; c++) newRow.push(row[c]);
    for (const h of newHeaders) newRow.push(h);
    for (let c = aiColIdx + 1; c < row.length; c++) newRow.push(row[c]);
  } else if (i >= 4) {
    const displayName = row[0] ? String(row[0]).trim() : "";
    const isMvpRow = displayName && !displayName.includes("לא נכנסו") && !displayName.includes("MVP");
    const aiDesc = row[aiColIdx] ? String(row[aiColIdx]).trim() : "";

    // Copy columns up to and including the AI explanation
    for (let c = 0; c <= aiColIdx; c++) newRow.push(row[c]);

    if (isMvpRow && aiDesc) {
      // Parse and insert structured columns
      const parsed = parseDescription(aiDesc);
      newRow.push(parsed.general_explanation);
      newRow.push(parsed.what_it_measures);
      newRow.push(parsed.valid_signals);
      newRow.push(parsed.what_not_to_infer);
      newRow.push(parsed.score_scale);
      newRow.push(parsed.partner_weight_guidance);
      newRow.push(parsed.special_notes);
    } else {
      // Non-MVP or empty rows — just add empty cells
      for (let c = 0; c < 7; c++) newRow.push("");
    }

    // Copy remaining columns
    for (let c = aiColIdx + 1; c < row.length; c++) newRow.push(row[c]);
  } else {
    // Title/description rows before header — copy as-is with padding
    for (let c = 0; c < row.length; c++) newRow.push(row[c]);
  }

  newData.push(newRow);
}

// Write back to Excel
const newWs = XLSX.utils.aoa_to_sheet(newData);
wb.Sheets["מאפיינים - כללי"] = newWs;
const OUTPUT_PATH = path.join(__dirname, "../../Docs/MatchMe DB - Structured.xlsx");
XLSX.writeFile(wb, OUTPUT_PATH);
console.log("Written to:", OUTPUT_PATH);

console.log("\n=== Done ===");
console.log("Added 7 new columns after the AI explanation column");
console.log("New headers:", newHeaders.join(" | "));

// Print sample for first 3 traits
console.log("\n=== Sample output (first 3 traits) ===");
for (let i = 4; i < Math.min(7, newData.length); i++) {
  const row = newData[i];
  console.log(`\n${row[0]}:`);
  for (let j = 0; j < 7; j++) {
    const val = row[aiColIdx + 1 + j];
    console.log(`  ${newHeaders[j]}: ${val ? String(val).slice(0, 80) : "(empty)"}`);
  }
}
