// app/server/registry_parser.ts
// Parses docs/spec/0001-action-registry.md's action tables at test time.
// Shared by permission_matrix.test.ts (the action-catalogue completeness
// check) and registry_linkage.test.ts (the Verified <-> tested bidirectional
// check). Not used by application code — test-time only.

import { readFileSync, readdirSync } from "fs";
import { resolve, join } from "path";

export interface RegistryRow {
  id: string;
  guard: string;
  status: string;
}

const ID_PATTERN = /^(SITE|AUTH|BRD|DECK|DASH|CREW|ADMIN|API)-\d{3}$/;

/** Parse every table row in the registry into {id, guard, status}. Guard is
 *  always the second-to-last cell and status the last cell, regardless of
 *  how many columns a section's table has (CREW carries an extra Tier column). */
export function parseRegistry(repoRoot: string = process.cwd()): RegistryRow[] {
  const path = resolve(repoRoot, "docs/spec/0001-action-registry.md");
  const text = readFileSync(path, "utf-8");
  const rows: RegistryRow[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length < 3) continue;
    const id = cells[0];
    if (!ID_PATTERN.test(id)) continue;
    rows.push({ id, guard: cells[cells.length - 2], status: cells[cells.length - 1] });
  }
  return rows;
}

const EXCLUDED_GUARD_PATTERNS = [/client-side/i, /^none needed$/i, /^—$/, /^inherits /i];

/**
 * "Server-enforced" per docs/plans/0006-close-the-tier-model.md Item 1: every
 * BRD/DECK/DASH/CREW/ADMIN/API row whose guard is not client-side, "none
 * needed", "—", or "inherits ...". SITE and AUTH are out of scope for the
 * permission matrix by the same brief.
 */
export function isServerEnforced(row: RegistryRow): boolean {
  if (!/^(BRD|DECK|DASH|CREW|ADMIN|API)-/.test(row.id)) return false;
  return !EXCLUDED_GUARD_PATTERNS.some((p) => p.test(row.guard));
}

/**
 * Registry IDs that are "server-enforced" by isServerEnforced's literal-phrase
 * test but are deliberately NOT in permission_matrix.test.ts's ACTION_CATALOG,
 * each with a one-line reason. Kept in this non-test file (rather than inline
 * in permission_matrix.test.ts) so listing an excluded ID here doesn't itself
 * count as a test "mentioning" it under registry_linkage's textual scan.
 */
export const MATRIX_EXTRA_EXCLUDED_IDS = new Set([
  "BRD-017", // short-circuits unconditionally — no actor-based check exists
  "BRD-018", // pure redirect — no permission logic
  "BRD-020", // Missing status — no code path to invoke
  "DECK-001", // a displayed field on the BRD-001 loader, not a distinct guarded route
  "DASH-002", "DASH-013", "DASH-014", "DASH-015", "DASH-017", // read-scoping / client-side, not an allow-deny gate
  "DASH-004", "DASH-005", // client-side sort/filter
  "CREW-010", "CREW-013", "CREW-018", // same loader/gate as CREW-003, not a distinct enforcement point
  "ADMIN-002", "ADMIN-003", // inherits ADMIN-001 / no distinct code path
  "API-001", "API-002", // always succeed — no denial branch exists
  "API-006", // service bearer secret, not an actor identity
]);

/** Recursively find every `*.test.ts`/`*.test.tsx` file under `dir`. */
export function findTestFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: import("fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      out.push(...findTestFiles(full));
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every registry ID (e.g. "BRD-004") mentioned anywhere in a file's text. */
export function idsMentionedIn(fileText: string): Set<string> {
  const found = new Set<string>();
  const re = /\b(SITE|AUTH|BRD|DECK|DASH|CREW|ADMIN|API)-\d{3}\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fileText))) found.add(m[0]);
  return found;
}

/** Read every test file under `appDir` and collect the set of registry IDs each mentions. */
export function collectMentionedIds(appDir: string): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const file of findTestFiles(appDir)) {
    const ids = idsMentionedIn(readFileSync(file, "utf-8"));
    if (ids.size > 0) result.set(file, ids);
  }
  return result;
}
