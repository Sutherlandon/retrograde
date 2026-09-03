// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const mockUseBoard = vi.fn();
vi.mock("~/context/BoardContext", () => ({
  useBoard: () => mockUseBoard(),
}));

vi.mock("react-router", () => ({
  useFetcher: () => ({ submit: vi.fn(), load: vi.fn(), data: null, state: "idle" }),
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
  votingScope: "board",
  notesLocked: false,
  boardLocked: false,
  attachments: [],
  updateBoardSettings: vi.fn(),
  attributionEnabled: false,
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

  it("renders expanded by default (DECK-001)", () => {
    render(<CommandDeck />);
    expect(screen.getByText("Command Deck")).toBeInTheDocument();
    expect(screen.getByText("Mission Clock")).toBeInTheDocument();
  });

  it("collapses to pill when minimize button clicked (DECK-029)", () => {
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
    // Pill has 4 LEDs: attribution (purple), hide others' notes (cyan), notes locked (amber), voting (blue)
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

  it("shows stats footer with notes, contributors, and voters (DECK-028)", () => {
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

  it("renders the User Attribution toggle (off by default)", () => {
    render(<CommandDeck />);
    expect(screen.getByText("User Attribution")).toBeInTheDocument();
  });

  it("warns before enabling attribution and only reveals after confirming (DECK-012)", () => {
    const updateBoardSettings = vi.fn();
    mockUseBoard.mockReturnValue({ ...defaultBoard, updateBoardSettings });
    render(<CommandDeck />);
    const toggleSwitch = screen.getByText("User Attribution").closest("div")!.parentElement!.querySelector("[role='switch']") as HTMLElement;
    fireEvent.click(toggleSwitch);
    // Enabling shows a warning first — nothing saved yet.
    expect(screen.getByText(/reveals who wrote each note/i)).toBeInTheDocument();
    expect(updateBoardSettings).not.toHaveBeenCalled();
    // Confirming reveals authorship.
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ attributionEnabled: true })
    );
  });

  it("cancelling the attribution warning leaves it off and saves nothing", () => {
    const updateBoardSettings = vi.fn();
    mockUseBoard.mockReturnValue({ ...defaultBoard, updateBoardSettings });
    render(<CommandDeck />);
    const toggleSwitch = screen.getByText("User Attribution").closest("div")!.parentElement!.querySelector("[role='switch']") as HTMLElement;
    fireEvent.click(toggleSwitch);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(updateBoardSettings).not.toHaveBeenCalled();
    expect(screen.queryByText(/reveals who wrote each note/i)).not.toBeInTheDocument();
  });

  it("disabling attribution applies immediately without a warning", () => {
    const updateBoardSettings = vi.fn();
    mockUseBoard.mockReturnValue({ ...defaultBoard, attributionEnabled: true, updateBoardSettings });
    render(<CommandDeck />);
    const toggleSwitch = screen.getByText("User Attribution").closest("div")!.parentElement!.querySelector("[role='switch']") as HTMLElement;
    fireEvent.click(toggleSwitch);
    expect(screen.queryByText(/reveals who wrote each note/i)).not.toBeInTheDocument();
    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ attributionEnabled: false })
    );
  });

  it("calls updateBoardSettings with actionItemsVisible:false when Action Items toggled off (DECK-014)", () => {
    const updateBoardSettings = vi.fn();
    mockUseBoard.mockReturnValue({ ...defaultBoard, actionItemsVisible: true, updateBoardSettings });
    render(<CommandDeck />);
    const toggleSwitch = screen.getByText("Action Items").closest("div")!.parentElement!.querySelector("[role='switch']") as HTMLElement;
    fireEvent.click(toggleSwitch);
    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ actionItemsVisible: false })
    );
  });

  it("renders the Hide Others' Notes toggle (off by default)", () => {
    render(<CommandDeck />);
    expect(screen.getByText("Hide Others' Notes")).toBeInTheDocument();
  });

  it("calls updateBoardSettings with hideOthersNotes:true when toggled on", () => {
    const updateBoardSettings = vi.fn();
    mockUseBoard.mockReturnValue({ ...defaultBoard, hideOthersNotes: false, updateBoardSettings });
    render(<CommandDeck />);
    const toggleSwitch = screen.getByText("Hide Others' Notes").closest("div")!.parentElement!.querySelector("[role='switch']") as HTMLElement;
    fireEvent.click(toggleSwitch);
    expect(updateBoardSettings).toHaveBeenCalledWith(
      expect.objectContaining({ hideOthersNotes: true })
    );
  });

  it("opens the Crew Access modal from Board Controls", () => {
    render(<CommandDeck />);
    fireEvent.click(screen.getByText("Crew Access"));
    expect(screen.getByRole("dialog", { name: "Crew Access" })).toBeInTheDocument();
    expect(screen.getByText("Open Deck to Everyone")).toBeInTheDocument();
  });

  it("lights amber LED when board is locked even if notes lock is off", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, boardLocked: true, notesLocked: false });
    const { container } = render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Minimize"));
    const amberLeds = container.querySelectorAll(".bg-amber-400");
    expect(amberLeds.length).toBeGreaterThan(0);
  });

  it("increases the displayed timer duration by 60s when + is clicked (DECK-004)", () => {
    const { container } = render(<CommandDeck />);
    const [minutesInput, secondsInput] = container.querySelectorAll("input[type='number']");
    expect(minutesInput).toHaveValue(3);
    expect(secondsInput).toHaveValue(0);

    fireEvent.click(screen.getByText("+"));

    expect(minutesInput).toHaveValue(4);
    expect(secondsInput).toHaveValue(0);
  });

  it("decreases the displayed timer duration by 60s when - is clicked (DECK-004)", () => {
    const { container } = render(<CommandDeck />);
    const [minutesInput, secondsInput] = container.querySelectorAll("input[type='number']");

    fireEvent.click(screen.getByText("-"));

    expect(minutesInput).toHaveValue(2);
    expect(secondsInput).toHaveValue(0);
  });

  it("does not let the timer drop below the 1 second minimum (DECK-004)", () => {
    const { container } = render(<CommandDeck />);
    const [minutesInput, secondsInput] = container.querySelectorAll("input[type='number']");

    fireEvent.change(minutesInput, { target: { value: "0" } });
    fireEvent.change(secondsInput, { target: { value: "0" } });

    fireEvent.click(screen.getByText("-"));
    expect(minutesInput).toHaveValue(0);
    expect(secondsInput).toHaveValue(1);

    // Clicking again would go negative — it stays floored at 1 second.
    fireEvent.click(screen.getByText("-"));
    expect(minutesInput).toHaveValue(0);
    expect(secondsInput).toHaveValue(1);
  });

  it("disables the timer +/- adjustment buttons when boardLocked (DECK-004)", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, boardLocked: true });
    render(<CommandDeck />);
    expect(screen.getByText("-")).toBeDisabled();
    expect(screen.getByText("+")).toBeDisabled();
  });

  it("calls sortNotesByScore when the sort button is clicked, labeled by likes/votes mode (DECK-007)", () => {
    const sortNotesByScore = vi.fn();
    mockUseBoard.mockReturnValue({ ...defaultBoard, votingEnabled: false, sortNotesByScore });
    render(<CommandDeck />);

    const sortButton = screen.getByText(/Sort by Likes/);
    fireEvent.click(sortButton);
    expect(sortNotesByScore).toHaveBeenCalledTimes(1);
  });

  it("labels the sort button by Votes when voting is enabled (DECK-007)", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, votingEnabled: true });
    render(<CommandDeck />);
    expect(screen.getByText(/Sort by Votes/)).toBeInTheDocument();
  });

  it("disables the sort-by-score button when boardLocked (DECK-007)", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, boardLocked: true });
    render(<CommandDeck />);
    expect(screen.getByText(/Sort by/)).toBeDisabled();
  });
});
