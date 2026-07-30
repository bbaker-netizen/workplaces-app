/**
 * READ-ONLY diagnostic for a failing archived-lead permanent delete.
 *
 * Deleting a prospect cascades into documents / activities / comments /
 * communications, and those children have children of their own. A single
 * grandchild FK left as NO ACTION anywhere in that graph fails the whole
 * statement, and the app surfaces only Drizzle's "Failed query" wrapper —
 * which names the top-level DELETE and tells you nothing about the real
 * constraint. This walks the cascade graph, then runs the exact DELETE
 * inside a transaction that is ALWAYS rolled back, so the true Postgres
 * error (constraint, table, detail) is printed.
 *
 * Deletes nothing. Writes nothing.
 *
 * Run: node scripts/diagnose-prospect-delete.mjs [prospectId ...]
 */
import fs from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const dbUrl = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("No DATABASE_URL / DATABASE_URL_OWNER set. Aborting.");
  process.exit(1);
}

const { neon } = await import("@neondatabase/serverless");
const sql = neon(dbUrl);

const ids =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : [
        "9c5439de-018e-4bbb-952d-965e4bce0746",
        "eddf4ce8-893f-4ba2-9302-11634126d11d",
        "e13c578d-aef3-4aa4-a60f-487450a51de7",
        "b83f1edf-3276-426a-a5b9-24bc8b984a28",
      ];

const RULE = {
  a: "NO ACTION",
  r: "RESTRICT",
  c: "CASCADE",
  n: "SET NULL",
  d: "SET DEFAULT",
};

async function fksReferencing(table) {
  return await sql`
    SELECT c.conname,
           src.relname AS referencing_table,
           a.attname   AS referencing_column,
           c.confdeltype AS del_rule
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_class tgt ON tgt.oid = c.confrelid
    JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f' AND tgt.relname = ${table}
    ORDER BY c.confdeltype, src.relname
  `;
}

// Walk the cascade graph out from prospects. Anything reachable by a chain
// of CASCADEs is a table this DELETE will also touch; a NO ACTION or
// RESTRICT hanging off any of them is what fails the statement.
console.log("=== Cascade graph from prospects ===");
const visited = new Set(["prospects"]);
const queue = [["prospects", 0]];
const blockers = [];
while (queue.length > 0) {
  const [table, depth] = queue.shift();
  const fks = await fksReferencing(table);
  for (const fk of fks) {
    const rule = RULE[fk.del_rule] ?? fk.del_rule;
    const blocks = fk.del_rule === "a" || fk.del_rule === "r";
    const pad = "  ".repeat(depth + 1);
    console.log(
      `${pad}${rule.padEnd(11)} ${fk.referencing_table}.${fk.referencing_column}` +
        ` (-> ${table})${blocks ? "   <-- BLOCKS" : ""}`,
    );
    if (blocks) blockers.push({ ...fk, parent: table });
    if (fk.del_rule === "c" && !visited.has(fk.referencing_table)) {
      visited.add(fk.referencing_table);
      queue.push([fk.referencing_table, depth + 1]);
    }
  }
}
console.log(`\nTables in the cascade set: ${[...visited].join(", ")}`);
console.log(
  blockers.length === 0
    ? "No blocking FK anywhere in the cascade graph."
    : `${blockers.length} blocking FK(s) found above.`,
);

console.log("\n=== The rows ===");
const rows = await sql`
  SELECT id, contact_name, status,
         archived_at IS NOT NULL AS archived,
         converted_engagement_id
  FROM prospects WHERE id = ANY(${ids}::uuid[])
`;
for (const r of rows) {
  console.log(
    `${r.id}  ${(r.contact_name ?? "(no name)").padEnd(26)} status=${r.status} ` +
      `archived=${r.archived} converted=${r.converted_engagement_id ?? "-"}`,
  );
}
if (rows.length !== ids.length)
  console.log(`(only ${rows.length} of ${ids.length} ids exist)`);

// The definitive check: run the real DELETE, then force a rollback with a
// deliberate error so nothing can ever commit. If the delete itself fails,
// its error is what surfaces; if it succeeds, we see the sentinel instead.
console.log("\n=== Dry-run DELETE (always rolled back) ===");
try {
  await sql.transaction([
    sql`DELETE FROM prospects
        WHERE id = ANY(${ids}::uuid[])
          AND archived_at IS NOT NULL
          AND converted_engagement_id IS NULL`,
    sql`SELECT 1 / 0`,
  ]);
  console.log("Unexpected: sentinel did not fire. Nothing committed?");
} catch (e) {
  if (e.code === "22012") {
    console.log(
      "DELETE SUCCEEDED (rolled back by sentinel). No constraint problem here.",
    );
  } else {
    console.log("DELETE FAILED. This is the real error:");
    console.log("  message:      ", e.message);
    for (const k of [
      "code",
      "severity",
      "detail",
      "hint",
      "table",
      "constraint",
      "schema",
    ]) {
      if (e[k]) console.log(`  ${k}:`.padEnd(16), e[k]);
    }
  }
}

console.log("\n=== Triggers on prospects ===");
const trg = await sql`
  SELECT tgname, pg_get_triggerdef(oid) AS def
  FROM pg_trigger WHERE tgrelid = 'prospects'::regclass AND NOT tgisinternal
`;
for (const t of trg) console.log(`${t.tgname}: ${t.def}`);
if (trg.length === 0) console.log("(none)");
