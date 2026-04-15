// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUseBoard = vi.fn();
vi.mock("~/context/BoardContext", () => ({
  useBoard: () => mockUseBoard(),
}));

import { BoardStatusBar } from "./BoardStatusBar";

const defaultBoard = {
  showPrompts: true,
  votingEnabled: false,
  votingAllowed: 5,
  notesLocked: false,
  boardLocked: false,
  columns: [
    { id: "c1", notes: [{ id: "n1", user_votes: 0 }, { id: "n2", user_votes: 1 }] },
  ],
};

describe("BoardStatusBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBoard.mockReturnValue(defaultBoard);
  });

  it("renders LED pill button", () => {
    render(<BoardStatusBar />);
    expect(screen.getByTitle("Board status")).toBeInTheDocument();
  });

  it("shows vote counter when voting is enabled", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, votingEnabled: true });
    render(<BoardStatusBar />);
    expect(screen.getByText("Votes")).toBeInTheDocument();
  });

  it("does not show vote counter when voting is disabled", () => {
    render(<BoardStatusBar />);
    expect(screen.queryByText("Votes")).not.toBeInTheDocument();
  });

  it("expands legend when LEDs are clicked", () => {
    render(<BoardStatusBar />);
    fireEvent.click(screen.getByTitle("Board status"));
    expect(screen.getByText("Prompts")).toBeInTheDocument();
    expect(screen.getByText("Voting")).toBeInTheDocument();
    expect(screen.getByText("Notes Locked")).toBeInTheDocument();
    expect(screen.getByText("Board Locked")).toBeInTheDocument();
  });

  it("collapses legend when clicked again", () => {
    render(<BoardStatusBar />);
    fireEvent.click(screen.getByTitle("Board status"));
    expect(screen.getByText("Prompts")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Board status"));
    expect(screen.queryByText("Prompts")).not.toBeInTheDocument();
  });

  it("closes legend when clicking outside", () => {
    render(<BoardStatusBar />);
    fireEvent.click(screen.getByTitle("Board status"));
    expect(screen.getByText("Prompts")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Prompts")).not.toBeInTheDocument();
  });

  it("shows correct vote count", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, votingEnabled: true, votingAllowed: 5 });
    render(<BoardStatusBar />);
    // 1 vote used (n2 has user_votes: 1), so 4 remaining
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("lights amber LED when board is locked", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, boardLocked: true });
    const { container } = render(<BoardStatusBar />);
    const amberLed = container.querySelector(".bg-amber-400");
    expect(amberLed).toBeInTheDocument();
  });
});
