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

import { CommandDeck } from "./CommandDeck";

const defaultBoard = {
  id: "board-1",
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

  it("shows status LEDs in pill", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, timerRunning: true });
    const { container } = render(<CommandDeck />);
    const greenLed = container.querySelector(".bg-green-400");
    expect(greenLed).toBeInTheDocument();
  });

  it("shows Launch button when timer not running", () => {
    render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Command Deck"));
    expect(screen.getByText("Launch")).toBeInTheDocument();
  });

  it("shows Abort Mission button when timer running", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, timerRunning: true, timeLeft: 120 });
    render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Command Deck"));
    expect(screen.getByText("Abort Mission")).toBeInTheDocument();
  });

  it("hides Add Column when board locked", () => {
    mockUseBoard.mockReturnValue({ ...defaultBoard, boardLocked: true });
    render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Command Deck"));
    expect(screen.queryByText("+ Add Column")).not.toBeInTheDocument();
  });

  it("shows stats footer", () => {
    render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Command Deck"));
    expect(screen.getByText(/1 col/)).toBeInTheDocument();
    expect(screen.getByText(/1 note/)).toBeInTheDocument();
  });

  it("minimizes when chevron clicked", () => {
    render(<CommandDeck />);
    fireEvent.click(screen.getByTitle("Command Deck"));
    expect(screen.getByText("Command Deck")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Minimize"));
    expect(screen.queryByText("Mission Clock")).not.toBeInTheDocument();
  });
});
