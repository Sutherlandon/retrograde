import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
    connect: vi.fn(async () => ({
      query: mockQuery,
      release: mockRelease,
    })),
  },
}));

vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("getAttachmentsServer", () => {
  it("returns attachments for a board", async () => {
    const { getAttachmentsServer } = await import("./attachment_model");

    const mockAttachments = [
      { id: "att-1", board_id: "board-1", filename: "doc.pdf", link: "https://example.com/doc.pdf", type: "link", image_data: null, created_at: "2026-01-01T00:00:00Z" },
      { id: "att-2", board_id: "board-1", filename: "photo.jpg", link: null, type: "image", image_data: "data:image/jpeg;base64,abc", created_at: "2026-01-02T00:00:00Z" },
    ];

    mockPoolQuery.mockResolvedValueOnce({ rows: mockAttachments, rowCount: 2 });

    const result = await getAttachmentsServer("board-1");

    expect(mockPoolQuery.mock.calls[0][0]).toContain("SELECT");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("attachments");
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["board-1"]);
    expect(result).toHaveLength(2);
    expect(result[0].filename).toBe("doc.pdf");
  });

  it("returns empty array when no attachments exist", async () => {
    const { getAttachmentsServer } = await import("./attachment_model");

    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await getAttachmentsServer("board-1");

    expect(result).toEqual([]);
  });
});

describe("addLinkAttachmentServer", () => {
  it("inserts a link attachment and returns updated list", async () => {
    const { addLinkAttachmentServer } = await import("./attachment_model");

    // INSERT
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });
    // getAttachmentsServer
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "att-1", board_id: "board-1", filename: "doc.pdf", link: "https://example.com/doc.pdf", type: "link", image_data: null, created_at: "2026-01-01T00:00:00Z" }],
      rowCount: 1,
    });

    const result = await addLinkAttachmentServer("board-1", "doc.pdf", "https://example.com/doc.pdf");

    expect(mockPoolQuery.mock.calls[0][0]).toContain("INSERT INTO attachments");
    expect(mockPoolQuery.mock.calls[0][1]).toContain("board-1");
    expect(mockPoolQuery.mock.calls[0][1]).toContain("doc.pdf");
    expect(mockPoolQuery.mock.calls[0][1]).toContain("https://example.com/doc.pdf");
    expect(mockPoolQuery.mock.calls[0][1]).toContain("link");
    expect(result).toHaveLength(1);
  });
});

describe("addImageAttachmentServer", () => {
  it("inserts an image attachment and returns updated list", async () => {
    const { addImageAttachmentServer } = await import("./attachment_model");

    const imageData = "data:image/jpeg;base64,/9j/4AAQ...";

    // COUNT check (under limit)
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 });
    // INSERT
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });
    // getAttachmentsServer
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "att-1", board_id: "board-1", filename: "photo.jpg", link: null, type: "image", image_data: imageData, created_at: "2026-01-01T00:00:00Z" }],
      rowCount: 1,
    });

    const result = await addImageAttachmentServer("board-1", "photo.jpg", imageData);

    expect(mockPoolQuery.mock.calls[0][0]).toContain("COUNT");
    expect(mockPoolQuery.mock.calls[1][0]).toContain("INSERT INTO attachments");
    expect(mockPoolQuery.mock.calls[1][1]).toContain("image");
    expect(mockPoolQuery.mock.calls[1][1]).toContain(imageData);
    expect(result).toHaveLength(1);
  });

  it("rejects images that exceed the size limit", async () => {
    const { addImageAttachmentServer } = await import("./attachment_model");

    // Create a string > 250KB
    const oversizedData = "data:image/jpeg;base64," + "A".repeat(300_000);

    await expect(addImageAttachmentServer("board-1", "huge.jpg", oversizedData)).rejects.toThrow(
      "Image data exceeds maximum size of 250KB"
    );

    // Should not have called DB
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it("enforces the 5-image upload limit", async () => {
    const { addImageAttachmentServer } = await import("./attachment_model");

    // Count query returns 5 existing images
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: "5" }], rowCount: 1 });

    await expect(addImageAttachmentServer("board-1", "photo.jpg", "data:image/jpeg;base64,abc")).rejects.toThrow(
      "Maximum of 5 uploaded images per board"
    );
  });
});

describe("deleteAttachmentServer", () => {
  it("deletes an attachment and returns updated list", async () => {
    const { deleteAttachmentServer } = await import("./attachment_model");

    // DELETE
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });
    // getAttachmentsServer
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await deleteAttachmentServer("board-1", "att-1");

    expect(mockPoolQuery.mock.calls[0][0]).toContain("DELETE FROM attachments");
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["att-1", "board-1"]);
    expect(result).toEqual([]);
  });
});
