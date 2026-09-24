// app/components/AttachmentsList.test.tsx
// Covers GAP-009 / DECK-019: attachment delete controls must gate on
// canFacilitate, not isOwner, so a granted facilitator who is not the board
// owner can still remove attachments; a plain participant cannot.
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mockUseBoard = vi.fn();
vi.mock("~/context/BoardContext", () => ({
  useBoard: () => mockUseBoard(),
}));

import { AttachmentsList } from "./AttachmentsList";
import type { Attachment } from "~/server/board.types";

const linkAttachment: Attachment = {
  id: "a1",
  board_id: "b1",
  filename: "notes.pdf",
  link: "https://example.com/notes.pdf",
  type: "link",
  image_data: null,
  created_at: "x",
};

const baseBoard = {
  attachments: [linkAttachment] as Attachment[],
  canFacilitate: true,
  deleteAttachment: vi.fn(),
};

describe("AttachmentsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBoard.mockReturnValue({ ...baseBoard });
  });

  afterEach(() => cleanup());

  it("shows the delete control to a granted facilitator who is not the owner", () => {
    mockUseBoard.mockReturnValue({ ...baseBoard, canFacilitate: true });
    render(<AttachmentsList />);
    expect(screen.getByTitle("Delete attachment")).toBeInTheDocument();
  });

  it("hides the delete control from a plain participant", () => {
    mockUseBoard.mockReturnValue({ ...baseBoard, canFacilitate: false });
    render(<AttachmentsList />);
    expect(screen.queryByTitle("Delete attachment")).toBeNull();
  });

  it("renders nothing when there are no attachments", () => {
    mockUseBoard.mockReturnValue({ ...baseBoard, attachments: [] });
    const { container } = render(<AttachmentsList />);
    expect(container.firstChild).toBeNull();
  });
});
