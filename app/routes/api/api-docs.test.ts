// app/routes/api/api-docs.test.ts
// public/llms.txt and docs/AI_AGENT_API.md document this JSON API for agents.
// They restate facts that live in code; this test holds each restated fact to
// its source so a doc fails CI instead of drifting.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("~/server/db_config", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("~/server/db_init", () => ({}));

import { DEFAULT_COLUMN_TITLES } from "~/server/board_model";

const read = (...path: string[]) => readFileSync(join(process.cwd(), ...path), "utf8");

// The quoted titles after "default" in the part of `doc` that `entry` matches.
function defaultColumnsIn(doc: string, entry: RegExp): string[] {
  const text = doc.match(entry)?.[0];
  if (!text) throw new Error(`no entry matches ${entry}`);
  const start = text.indexOf("default");
  if (start === -1) throw new Error(`the entry matching ${entry} does not name the default columns`);
  return [...text.slice(start).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("agent API docs", () => {
  it("public/llms.txt names the columns POST /api/v1/boards seeds when `columns` is omitted", () => {
    const columnsBullet = /^- `columns`.*(?:\n {2}.*)*/m;
    expect(defaultColumnsIn(read("public", "llms.txt"), columnsBullet)).toEqual(DEFAULT_COLUMN_TITLES);
  });

  it("docs/AI_AGENT_API.md names the same default columns", () => {
    const columnsRow = /^\| `columns`.*$/m;
    expect(defaultColumnsIn(read("docs", "AI_AGENT_API.md"), columnsRow)).toEqual(DEFAULT_COLUMN_TITLES);
  });
});
