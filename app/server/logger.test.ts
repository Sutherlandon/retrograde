// app/server/logger.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { logMetric, logError } from "./logger";

describe("logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("logMetric", () => {
    it("emits [METRIC] tag with no context", () => {
      logMetric("Login");
      expect(console.log).toHaveBeenCalledWith("[METRIC] Login");
    });

    it("includes a single context field", () => {
      logMetric("Login", { userId: 42 });
      expect(console.log).toHaveBeenCalledWith("[METRIC] Login - userId=42");
    });

    it("includes multiple context fields separated by spaces", () => {
      logMetric("Delete Board", { userId: 1, boardId: "abc" });
      expect(console.log).toHaveBeenCalledWith(
        "[METRIC] Delete Board - userId=1 boardId=abc"
      );
    });
  });

  describe("logError", () => {
    it("emits [ERROR] tag with location and error", () => {
      const err = new Error("something broke");
      logError("board.notes action", err);
      expect(console.error).toHaveBeenCalledWith(
        "[ERROR] board.notes action:",
        err
      );
    });
  });

});
