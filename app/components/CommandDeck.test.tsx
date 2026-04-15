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

  it("renders expanded by default", () => {
    render(<CommandDeck />);
    expect(screen.getByText("Command Deck")).toBeInTheDocument();
    expect(screen.getByText("Mission Clock")).toBeInTheDocument();
  });

  it("collapses to pill when minimize button clicked", () => {
    render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Minimize"));
    expect(screen.queryByText("Mission Clock")).not.toBeInTheDocument();
    expect(screen.getByTitle("Command Deck")).toBeInTheDocument();
  });

  it("re-expands when pill is clicked after collapsing", () => {
    render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Minimize"));
    fireEvent.click(screen.getByTitle("Command Deck"));
    expect(screen.getByText("Mission Clock")).toBeInTheDocument();
  });

  it("shows 4 status LEDs in pill when collapsed", () => {
    const { container } = render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Minimize"));
    // Pill has 4 LEDs: prompts (green/active), voting (gray), notes locked (gray), board locked (gray)
    const leds = container.querySelectorAll(".rounded-full.inline-block");
    expect(leds.length).toBe(4);
  });

  it("shows Launch button when timer not running", () => {
    render(<CommandDeck />);
    expect(screen.getByText("Start Countdown")).toBeInTheDocument();
  });

  it("shows Abort Mission button when timer running", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, timerRunning: true, timeLeft: 120 });
    render(<CommandDeck />);
    expect(screen.getByText("Abort Mission")).toBeInTheDocument();
  });

  it("disables Add Column when board locked", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, boardLocked: true });
    render(<CommandDeck />);
    expect(screen.getByText("+ Add Column")).toBeDisabled();
  });

  it("shows stats footer with notes, contributors, and voters", () => {
    render(<CommandDeck />);
    expect(screen.getByText(/1 note/)).toBeInTheDocument();
    expect(screen.getByText(/3 contributors/)).toBeInTheDocument();
    expect(screen.getByText(/2 voters/)).toBeInTheDocument();
  });

  it("disables voting toggle while confirm warning is showing", () => {
    render(<CommandDeck />);
    // Click the Enable Voting toggle to trigger the warning
    const votingSwitch = screen.getByText("Enable Voting").closest("div")!.parentElement!.querySelector("[role='switch']") as HTMLElement;
    fireEvent.click(votingSwitch);
    // Warning should appear
    expect(screen.getByText(/Enabling voting will clear all likes and votes/)).toBeInTheDocument();
    // Toggle should now be disabled (opacity-50 indicates disabled state)
    expect(votingSwitch.className).toContain("opacity-50");
  });

  it("opens voting info modal when info icon is clicked", () => {
    render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Voting info"));
    expect(screen.getByText("Like Mode")).toBeInTheDocument();
    expect(screen.getByText("Voting Mode")).toBeInTheDocument();
  });

  it("lights amber LED when board is locked even if notes lock is off", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, boardLocked: true, notesLocked: false });
    const { container } = render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Minimize"));
    const amberLeds = container.querySelectorAll(".bg-amber-400");
    expect(amberLeds.length).toBeGreaterThan(0);
  });
});
