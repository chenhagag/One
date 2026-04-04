/**
 * Remove internal trait definitions that have no group value (leftovers not in current Excel model).
 * Also removes associated user_traits rows.
 * External traits are NOT touched (they don't have group in the Excel).
 *
 * Run: npx ts-node src/cleanupTraits.ts
 */
import db from "./db";

console.log("=== Internal traits with NULL/empty group (will be DELETED) ===");
const toDelete = db.prepare(
  `SELECT id, internal_name, trait_group, weight, calc_type FROM trait_definitions
   WHERE trait_group IS NULL OR TRIM(trait_group) = ''`
).all() as any[];
toDelete.forEach(t => {
  const refs = (db.prepare("SELECT COUNT(*) as c FROM user_traits WHERE trait_definition_id = ?").get(t.id) as any).c;
  console.log(`  #${t.id} ${t.internal_name} (weight=${t.weight}, calc=${t.calc_type}) — ${refs} user_traits rows`);
});
console.log(`Count: ${toDelete.length}`);

console.log("\n=== Internal traits WITH group (will be KEPT) ===");
const kept = (db.prepare(
  `SELECT COUNT(*) as c FROM trait_definitions WHERE trait_group IS NOT NULL AND TRIM(trait_group) != ''`
).get() as any).c;
console.log(`Count: ${kept}`);

if (toDelete.length === 0) {
  console.log("\nNothing to delete.");
  process.exit(0);
}

console.log("\n=== Deleting... ===");
const idsToDelete = toDelete.map((t: any) => t.id);

db.transaction(() => {
  // First delete referencing user_traits
  for (const id of idsToDelete) {
    const del = db.prepare("DELETE FROM user_traits WHERE trait_definition_id = ?").run(id);
    if (del.changes > 0) console.log(`  Deleted ${del.changes} user_traits for trait_definition_id=${id}`);
  }
  // Then delete the definitions
  for (const id of idsToDelete) {
    db.prepare("DELETE FROM trait_definitions WHERE id = ?").run(id);
  }
  console.log(`  Deleted ${idsToDelete.length} trait definitions`);
})();

const finalCount = (db.prepare("SELECT COUNT(*) as c FROM trait_definitions").get() as any).c;
console.log(`\nFinal: ${finalCount} internal trait definitions remaining`);
