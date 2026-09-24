// app/server/registry_linkage.test.ts
// Keeps docs/spec/0001-action-registry.md's Status column honest in both
// directions (docs/plans/0006-close-the-tier-model.md Item 2 / ADR-0011 §8):
//   1. Every row marked Verified is named by at least one test file.
//   2. Every ID a test names has a registry row, and that row is not marked
//      Unverified — a test naming an Unverified row is a bookkeeping error
//      (the status should have been flipped), not a suite failure to hide.
//
// Rows marked Gap / Ungated / Broken / Missing may legitimately be named by a
// test that documents the gap, and may otherwise go unreferenced.

import { describe, it, expect } from "vitest";
import path from "path";
import { parseRegistry, collectMentionedIds } from "./registry_parser";

const REPO_ROOT = path.resolve(__dirname, "../..");
const APP_DIR = path.resolve(REPO_ROOT, "app");

const registryRows = parseRegistry(REPO_ROOT);
const mentionedByFile = collectMentionedIds(APP_DIR);

const allMentionedIds = new Set<string>();
for (const ids of mentionedByFile.values()) {
  for (const id of ids) allMentionedIds.add(id);
}

const registryById = new Map(registryRows.map((r) => [r.id, r]));

describe("registry linkage", () => {
  it("parsed at least one row from every action-registry section", () => {
    // A sanity floor so a parser regression (e.g. a table format change)
    // fails loudly here instead of silently passing both assertions below
    // with an empty row set.
    expect(registryRows.length).toBeGreaterThan(50);
  });

  it("every Verified row is named by at least one test file", () => {
    const verifiedIds = registryRows.filter((r) => r.status === "Verified").map((r) => r.id);
    const unreferenced = verifiedIds.filter((id) => !allMentionedIds.has(id));

    expect(
      unreferenced,
      `Verified registry rows with no test naming their ID: ${unreferenced.join(", ") || "(none)"}`
    ).toEqual([]);
  });

  it("every ID a test names has a registry row that is not marked Unverified", () => {
    const bookkeepingErrors: string[] = [];
    const unknownIds: string[] = [];

    for (const id of allMentionedIds) {
      const row = registryById.get(id);
      if (!row) {
        unknownIds.push(id);
        continue;
      }
      if (row.status === "Unverified") {
        bookkeepingErrors.push(`${id} (status: Unverified)`);
      }
    }

    expect(
      unknownIds,
      `Test files mention IDs with no registry row: ${unknownIds.join(", ") || "(none)"}`
    ).toEqual([]);
    expect(
      bookkeepingErrors,
      `IDs named by a test but still marked Unverified in the registry (flip to Verified): ${
        bookkeepingErrors.join(", ") || "(none)"
      }`
    ).toEqual([]);
  });
});
