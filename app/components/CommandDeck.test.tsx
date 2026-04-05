// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const mockUseBoard = vi.fn();
vi.mock("~/context/BoardContext", () => ({
  useBoard: () => mockUseBoard(),
}));

vi.mock("react-router", () => ({
  useFetcher: () => ({ submit: vi.fn(), data: null, state: "idle" }),
}));

vi.mock("~/utils/exportBoard", () => ({
  exportToCSV: vi.fn(() => "csv-data"),
  exportToMarkdown: vi.fn(() => "md-data"),
  downloadFile: vi.fn(),
}));

import { CommandDeck } from "./CommandDeck";

const defaultBoard = {
  id: "board-1",
  title: "Test Board",
  isOwner: true,
  timerRunning: false,
  timeLeft: null,
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
  addColumn: vi.fn(),
  columns: [{ id: "c1", title: "Col 1", notes: [{ id: "n1" }], col_order: 0, prompt: "" }],
  votingEnabled: false,
  votingAllowed: 5,
  notesLocked: false,
  boardLocked: false,
  attachments: [],
  updateBoardSettings: vi.fn(),
  showPrompts: true,
  setShowPrompts: vi.fn(),
  sortNotesByScore: vi.fn(),
  voterCount: 2,
  contributorCount: 3,
};

describe("CommandDeck", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBoard.mockReturnValue(defaultBoard);
  });

  it("renders minimized pill by default", () => {
    render(<CommandDeck />);
    expect(screen.getByTitle("Command Deck")).toBeInTheDocument();
  });

  it("expands when pill is clicked", () => {
    render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Command Deck"));
    expect(screen.getByText("Command Deck")).toBeInTheDocument();
    expect(screen.getByText("Mission Clock")).toBeInTheDocument();
  });

  it("shows 4 status LEDs in pill", () => {
    const { container } = render(<CommandDeck />);
    // Pill has 4 LEDs: prompts (green/active), voting (gray), notes locked (gray), board locked (gray)
    const leds = container.querySelectorAll(".rounded-full.inline-block");
    expect(leds.length).toBe(4);
  });

  it("shows Launch button when timer not running", () => {
    render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Command Deck"));
    expect(screen.getByText("Start Countdown")).toBeInTheDocument();
  });

  it("shows Abort Mission button when timer running", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, timerRunning: true, timeLeft: 120 });
    render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Command Deck"));
    expect(screen.getByText("Abort Mission")).toBeInTheDocument();
  });

  it("disables Add Column when board locked", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, boardLocked: true });
    render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Command Deck"));
    expect(screen.getByText("+ Add Column")).toBeDisabled();
  });

  it("shows stats footer with notes, contributors, and voters", () => {
    render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Command Deck"));
    expect(screen.getByText(/1 note/)).toBeInTheDocument();
    expect(screen.getByText(/3 contributors/)).toBeInTheDocument();
    expect(screen.getByText(/2 voters/)).toBeInTheDocument();
  });

  it("minimizes when chevron clicked", () => {
    render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Command Deck"));
    expect(screen.getByText("Command Deck")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Minimize"));
    expect(screen.queryByText("Mission Clock")).not.toBeInTheDocument();
  });

  it("lights amber LED when board is locked even if notes lock is off", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, boardLocked: true, notesLocked: false });
    const { container } = render(<CommandDeck />);
    const amberLeds = container.querySelectorAll(".bg-amber-400");
    expect(amberLeds.length).toBeGreaterThan(0);
  });
});
