// app/routes/app/board.attachments.test.ts
// Covers BRD-019 (loader guard) and DECK-017/018/019 (facilitator-gated action).

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireBoardAccess = vi.fn();
const mockRequireFacilitator = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  requireBoardAccess: (...args: unknown[]) => mockRequireBoardAccess(...args),
  requireFacilitator: (...args: unknown[]) => mockRequireFacilitator(...args),
}));

const mockGetAttachments = vi.fn();
const mockAddLinkAttachment = vi.fn();
const mockAddImageAttachment = vi.fn();
const mockDeleteAttachment = vi.fn();
vi.mock("~/server/attachment_model", () => ({
  getAttachmentsServer: (...args: unknown[]) => mockGetAttachments(...args),
  addLinkAttachmentServer: (...args: unknown[]) => mockAddLinkAttachment(...args),
  addImageAttachmentServer: (...args: unknown[]) => mockAddImageAttachment(...args),
  deleteAttachmentServer: (...args: unknown[]) => mockDeleteAttachment(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireBoardAccess.mockResolvedValue({ id: "user-1" });
  mockRequireFacilitator.mockResolvedValue({ id: "user-1" });
  mockGetAttachments.mockResolvedValue([{ id: "att-1", filename: "notes.pdf" }]);
  mockAddLinkAttachment.mockResolvedValue({ id: "att-2" });
  mockAddImageAttachment.mockResolvedValue({ id: "att-3" });
  mockDeleteAttachment.mockResolvedValue({ ok: true });
});

function loaderRequest() {
  return new Request("http://localhost:3000/app/board/board-1/attachments");
}

function actionRequest(method: string, fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("http://localhost:3000/app/board/board-1/attachments", { method, body: form });
}

describe("board.attachments loader", () => {
  it("checks board access before listing attachments (BRD-019)", async () => {
    const { loader } = await import("./board.attachments");
    const response = (await loader({
      request: loaderRequest(),
      params: { id: "board-1" },
      context: {},
    } as never)) as Response;

    expect(mockRequireBoardAccess).toHaveBeenCalledWith(expect.any(Request), "board-1");
    expect(response.status).toBe(200);
    expect(mockGetAttachments).toHaveBeenCalledWith("board-1");
  });

  it("propagates the access check's rejection and never lists attachments", async () => {
    const { loader } = await import("./board.attachments");
    mockRequireBoardAccess.mockRejectedValueOnce(
      new Response("This board is restricted to its crew", { status: 403 })
    );

    try {
      await loader({ request: loaderRequest(), params: { id: "board-1" }, context: {} } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
    expect(mockGetAttachments).not.toHaveBeenCalled();
  });

  it("throws 400 when the board id is missing", async () => {
    const { loader } = await import("./board.attachments");
    try {
      await loader({ request: loaderRequest(), params: {}, context: {} } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(400);
    }
  });
});

describe("board.attachments action", () => {
  it("requires facilitator status before adding a link attachment (DECK-017)", async () => {
    const { action } = await import("./board.attachments");
    await action({
      request: actionRequest("POST", { type: "link", filename: "doc", link: "https://x.test" }),
      params: { id: "board-1" },
      context: {},
    } as never);

    expect(mockRequireFacilitator).toHaveBeenCalledWith(expect.any(Request), "board-1");
    expect(mockAddLinkAttachment).toHaveBeenCalledWith("board-1", "doc", "https://x.test");
  });

  it("requires facilitator status before adding an image attachment (DECK-018)", async () => {
    const { action } = await import("./board.attachments");
    await action({
      request: actionRequest("POST", { type: "image", filename: "pic.png", imageData: "data:..." }),
      params: { id: "board-1" },
      context: {},
    } as never);

    expect(mockRequireFacilitator).toHaveBeenCalledWith(expect.any(Request), "board-1");
    expect(mockAddImageAttachment).toHaveBeenCalledWith("board-1", "pic.png", "data:...");
  });

  it("requires facilitator status before deleting an attachment (DECK-019)", async () => {
    const { action } = await import("./board.attachments");
    await action({
      request: actionRequest("DELETE", { attachmentId: "att-1" }),
      params: { id: "board-1" },
      context: {},
    } as never);

    expect(mockRequireFacilitator).toHaveBeenCalledWith(expect.any(Request), "board-1");
    expect(mockDeleteAttachment).toHaveBeenCalledWith("board-1", "att-1");
  });

  it("rejects a non-facilitator with 403 and never mutates attachments", async () => {
    const { action } = await import("./board.attachments");
    mockRequireFacilitator.mockRejectedValueOnce(
      new Response("Facilitator access required", { status: 403 })
    );

    try {
      await action({
        request: actionRequest("DELETE", { attachmentId: "att-1" }),
        params: { id: "board-1" },
        context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
    expect(mockDeleteAttachment).not.toHaveBeenCalled();
  });
});
