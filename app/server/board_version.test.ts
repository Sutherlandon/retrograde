// app/server/board_version.test.ts
// Keeps board version tracking honest: every table a board snapshot reads is
// either tracked by a trigger or explicitly classified as untracked.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
vi.mock("./db_config", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));

import {
  BOARD_VERSION_DDL,
  TRACKED_TABLES,
  TRACKED_TABLE_NAMES,
  UNTRACKED_TABLES,
  VERSION_TABLE,
  triggerName,
} from "./board_version";

function tablesIn(sql: string): Set<string> {
  const out = new Set<string>();
  const code = sql.replace(/--[^\n]*/g, ""); // comments say "from participants" and the like
  for (const m of code.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)\b/gi)) out.add(m[1].toLowerCase());
  return out;
}

beforeEach(() => {
  mockPoolQuery.mockReset();
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("snapshot tables are classified", () => {
  it("every table the board snapshot reads is tracked or explicitly untracked", async () => {
    const { getBoardServer } = await import("./board_model");
    const { getAttachmentsServer } = await import("./attachment_model");
    await getBoardServer("b", "00000000-0000-0000-0000-000000000000");
    await getAttachmentsServer("b");

    const sqls = mockPoolQuery.mock.calls.map((c) => c[0] as string);
    expect(sqls.length).toBe(2);
    const found = new Set(sqls.flatMap((s) => [...tablesIn(s)]));
    expect(found.has("notes")).toBe(true); // the extraction actually works
    expect(found.has(VERSION_TABLE)).toBe(true);

    const known = new Set([...TRACKED_TABLE_NAMES, ...Object.keys(UNTRACKED_TABLES), VERSION_TABLE]);
    const unclassified = [...found].filter((t) => !known.has(t));
    expect(unclassified).toEqual([]);
  });

  it("a table is never both tracked and untracked, and untracked ones carry a reason", () => {
    for (const t of Object.keys(UNTRACKED_TABLES)) {
      expect(TRACKED_TABLE_NAMES).not.toContain(t);
      expect(UNTRACKED_TABLES[t].length).toBeGreaterThan(0);
    }
  });
});

describe("BOARD_VERSION_DDL", () => {
  const ddl = BOARD_VERSION_DDL.join("\n");

  it("creates the version table and the bump function", () => {
    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS board_versions");
    expect(ddl).toContain("CREATE OR REPLACE FUNCTION bump_board_version");
  });

  it("creates a deferred constraint trigger for every tracked table, guarded by pg_trigger", () => {
    const blocks = BOARD_VERSION_DDL.filter((s) => s.includes("CREATE CONSTRAINT TRIGGER"));
    expect(blocks).toHaveLength(TRACKED_TABLES.length);
    for (const t of TRACKED_TABLES) {
      const name = triggerName(t.table);
      const block = blocks.find((b) => b.includes(`CREATE CONSTRAINT TRIGGER ${name}`));
      expect(block, t.table).toBeDefined();
      expect(block).toContain(`ON ${t.table}`);
      expect(block).toContain("DEFERRABLE INITIALLY DEFERRED");
      expect(block).toContain("FOR EACH ROW");
      expect(block).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_trigger WHERE tgname = '/);
      expect(block).toContain(`tgname = '${name}'`);
    }
  });

  it("boards fires on insert/update only; others also on delete", () => {
    for (const t of TRACKED_TABLES) {
      const block = BOARD_VERSION_DDL.find((b) => b.includes(`CREATE CONSTRAINT TRIGGER ${triggerName(t.table)}`))!;
      if (t.table === "boards") expect(block).toContain("AFTER INSERT OR UPDATE ON boards");
      else expect(block).toContain(`AFTER INSERT OR UPDATE OR DELETE ON ${t.table}`);
    }
  });

  it("trigger functions bump both boards when a row moves between them", () => {
    const fn = BOARD_VERSION_DDL.find((s) => s.includes("FUNCTION board_version_trg_notes"))!;
    expect(fn).toContain("CREATE OR REPLACE FUNCTION");
    expect(fn).toContain("OLD.column_id");
    expect(fn).toContain("NEW.column_id");
    expect(fn).toContain("IS DISTINCT FROM old_board");
  });
});
