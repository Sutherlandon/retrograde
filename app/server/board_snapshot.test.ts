// app/server/board_snapshot.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetBoard = vi.fn();
const mockStopTimer = vi.fn();
vi.mock("~/server/board_model", () => ({
  getBoardServer: (...a: unknown[]) => mockGetBoard(...a),
  stopTimerServer: (...a: unknown[]) => mockStopTimer(...a),
}));

const mockGetAttachments = vi.fn();
vi.mock("~/server/attachment_model", () => ({
  getAttachmentsServer: (...a: unknown[]) => mockGetAttachments(...a),
}));

import { getBoardSnapshot } from "./board_snapshot";

const attachments = [{ id: "att-1", filename: "plan.png", type: "image", link: null, image_data: "data:...", board_id: "b1", created_at: "x" }];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAttachments.mockResolvedValue(attachments);
});

describe("getBoardSnapshot", () => {
  it("returns the board as the viewer sees it, with its attachments", async () => {
    mockGetBoard.mockResolvedValueOnce({ id: "b1", timerRunning: false, timerEndsAt: null });
    const board = await getBoardSnapshot("b1", "agent-1");
    expect(mockGetBoard).toHaveBeenCalledWith("b1", "agent-1");
    expect(board).toEqual({ id: "b1", timerRunning: false, timerEndsAt: null, attachments });
    expect(mockStopTimer).not.toHaveBeenCalled();
  });

  it("stops a timer that has run out and reports it stopped", async () => {
    mockGetBoard.mockResolvedValueOnce({ id: "b1", timerRunning: true, timerEndsAt: "2020-01-01T00:00:00Z" });
    const board = await getBoardSnapshot("b1", null);
    expect(mockStopTimer).toHaveBeenCalledWith("b1");
    expect(board).toMatchObject({ timerRunning: false, timerEndsAt: null });
  });

  it("leaves a running timer alone", async () => {
    const endsAt = new Date(Date.now() + 60_000).toISOString();
    mockGetBoard.mockResolvedValueOnce({ id: "b1", timerRunning: true, timerEndsAt: endsAt });
    const board = await getBoardSnapshot("b1", null);
    expect(mockStopTimer).not.toHaveBeenCalled();
    expect(board).toMatchObject({ timerRunning: true, timerEndsAt: endsAt });
  });

  it("is null for a missing board", async () => {
    mockGetBoard.mockResolvedValueOnce(null);
    expect(await getBoardSnapshot("nope", null)).toBeNull();
    expect(mockGetAttachments).not.toHaveBeenCalled();
  });
});
