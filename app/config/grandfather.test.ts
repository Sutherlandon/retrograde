// app/config/grandfather.test.ts
// ADR-0019: the archive job only touches crewless boards created on or after
// 1 October 2026. Every board that exists at release stays open.
import { describe, it, expect } from "vitest";
import { GRANDFATHER_CUTOFF, FREE_TIER_TTL_DAYS } from "./grandfather";

describe("free-tier TTL constants", () => {
  it("grandfathers every board created before 1 October 2026", () => {
    expect(GRANDFATHER_CUTOFF).toBe("2026-10-01T00:00:00Z");
  });

  it("archives a crewless board 30 days after it was created", () => {
    expect(FREE_TIER_TTL_DAYS).toBe(30);
  });
});
