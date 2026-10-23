// app/config/board_limits.test.ts
import { describe, it, expect } from "vitest";
import { BOARD_LIMITS, tooLong } from "./board_limits";

describe("BOARD_LIMITS", () => {
  it("holds the limits both the browser and the agent API enforce", () => {
    expect(BOARD_LIMITS).toEqual({
      boardTitle: 200,
      columnTitle: 100,
      columnPrompt: 2000,
      noteText: 2000,
      actionItemText: 2000,
    });
  });
});

describe("tooLong", () => {
  it("names the field when a value is over its limit", () => {
    expect(tooLong("noteText", "x".repeat(2001))).toBe("Note text exceeds 2000 chars");
    expect(tooLong("boardTitle", "x".repeat(201))).toBe("Board title exceeds 200 chars");
  });

  it("is null at or under the limit, and for a missing value", () => {
    expect(tooLong("columnTitle", "x".repeat(100))).toBeNull();
    expect(tooLong("columnPrompt", "")).toBeNull();
    expect(tooLong("actionItemText", null)).toBeNull();
    expect(tooLong("actionItemText", undefined)).toBeNull();
  });
});
