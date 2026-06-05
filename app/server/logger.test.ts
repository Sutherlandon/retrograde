// app/server/logger.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { logMetric, logError, withErrorLogging } from "./logger";

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

  describe("withErrorLogging", () => {
    it("returns the resolved value on success", async () => {
      const result = await withErrorLogging("test", () =>
        Promise.resolve("ok")
      );
      expect(result).toBe("ok");
    });

    it("logs and rethrows non-Response errors", async () => {
      const err = new Error("db failure");
      await expect(
        withErrorLogging("test", () => Promise.reject(err))
      ).rejects.toThrow("db failure");
      expect(console.error).toHaveBeenCalledWith("[ERROR] test:", err);
    });

    it("does not log intentional HTTP Response errors", async () => {
      const err = new Response("Not Found", { status: 404 });
      await expect(
        withErrorLogging("test", () => Promise.reject(err))
      ).rejects.toBe(err);
      expect(console.error).not.toHaveBeenCalled();
    });
  });
});
