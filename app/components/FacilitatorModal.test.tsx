// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const mockSubmit = vi.fn();
const mockLoad = vi.fn();
let mockFetcherData: unknown = null;
vi.mock("react-router", () => ({
  useFetcher: () => ({
    submit: mockSubmit,
    load: mockLoad,
    data: mockFetcherData,
    state: "idle",
  }),
}));

import { FacilitatorModal } from "./FacilitatorModal";

describe("FacilitatorModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetcherData = {
      facilitators: [
        { user_id: "u1", role: "owner", username: "landon" },
        { user_id: "u2", role: "facilitator", username: "sam" },
      ],
      openFacilitation: false,
    };
  });

  afterEach(() => cleanup());

  it("renders nothing when closed", () => {
    render(<FacilitatorModal boardId="b1" isOpen={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the crew list with the owner as Commander (no revoke)", () => {
    render(<FacilitatorModal boardId="b1" isOpen onClose={() => {}} />);
    expect(screen.getByText("Crew Access")).toBeInTheDocument();
    expect(screen.getByText("landon")).toBeInTheDocument();
    expect(screen.getByText("Commander")).toBeInTheDocument();
    // Only the facilitator row has a revoke button
    expect(screen.getAllByText("Revoke")).toHaveLength(1);
  });

  it("grants access by username via POST", () => {
    render(<FacilitatorModal boardId="b1" isOpen onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "alex" } });
    fireEvent.click(screen.getByText("Grant"));
    expect(mockSubmit).toHaveBeenCalledWith(
      { username: "alex" },
      { method: "POST", action: "/app/board/b1/facilitators" }
    );
  });

  it("revokes a facilitator via DELETE", () => {
    render(<FacilitatorModal boardId="b1" isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByText("Revoke"));
    expect(mockSubmit).toHaveBeenCalledWith(
      { userId: "u2" },
      { method: "DELETE", action: "/app/board/b1/facilitators" }
    );
  });

  it("toggles open facilitation via PATCH", () => {
    render(<FacilitatorModal boardId="b1" isOpen onClose={() => {}} />);
    const toggle = screen.getByText("Open Deck to Everyone").closest("div")!.parentElement!.querySelector("[role='switch']") as HTMLElement;
    fireEvent.click(toggle);
    expect(mockSubmit).toHaveBeenCalledWith(
      { openFacilitation: "true" },
      { method: "PATCH", action: "/app/board/b1/facilitators" }
    );
  });

  it("shows a lookup error from the server", () => {
    mockFetcherData = { facilitators: [], openFacilitation: false, error: 'No registered user found with username "ghost".' };
    render(<FacilitatorModal boardId="b1" isOpen onClose={() => {}} />);
    expect(screen.getByText(/ghost/)).toBeInTheDocument();
  });

  it("calls onClose from the close button", () => {
    const onClose = vi.fn();
    render(<FacilitatorModal boardId="b1" isOpen onClose={onClose} />);
    fireEvent.click(screen.getByTitle("Close"));
    expect(onClose).toHaveBeenCalled();
  });
});
