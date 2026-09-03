// @vitest-environment jsdom
// DECK-005: seeing the timer-end modal. This file tests the modal component
// itself; the trigger condition (timeLeft going from >0 to exactly 0) is
// exercised against the real BoardProvider + Board component below, since
// that logic lives in Board.tsx's effect, not in the modal.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import type { BoardDTO } from "~/server/board.types";

import TimerEndModal from "./TimerEndModal";

describe("TimerEndModal (DECK-005)", () => {
  afterEach(() => cleanup());

  it("renders nothing when isOpen is false", () => {
    const { container } = render(<TimerEndModal isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the timer-complete copy when isOpen is true", () => {
    render(<TimerEndModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText(/LIFT OFF!/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Timer Complete" })).toBeInTheDocument();
  });

  it("calls onClose when the dismiss button is clicked", () => {
    const onClose = vi.fn();
    render(<TimerEndModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Timer Complete" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(<TimerEndModal isOpen={true} onClose={onClose} />);
    const backdrop = container.querySelector(".animate-fadeIn") as HTMLElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Trigger condition unit: Board.tsx shows the modal only when timeLeft
// transitions from a positive number down to exactly 0 (not on first render
// with timeLeft already 0, and not while timeLeft stays null/positive).
// ---------------------------------------------------------------------------

const mockLoaderData = vi.fn();
vi.mock("react-router", () => ({
  useLoaderData: () => mockLoaderData(),
  useFetcher: () => ({ submit: vi.fn(), load: vi.fn(), data: null, state: "idle" as const }),
}));
vi.mock("~/context/userContext", () => ({
  useOptionalUser: () => null,
}));
vi.mock("./BoardToolbar", () => ({ default: () => <div data-testid="toolbar" /> }));
vi.mock("./Column", () => ({ default: () => <div data-testid="column" /> }));
vi.mock("./AttachmentsList", () => ({ AttachmentsList: () => null }));
vi.mock("./CommandDeck", () => ({ CommandDeck: () => null }));
vi.mock("./ActionItemsPanel", () => ({ ActionItemsPanel: () => null }));

function baseLoaderData(timerEndsAt: string): BoardDTO {
  return {
    id: "board-1",
    title: "Test board",
    readonly: false,
    timerRunning: true,
    timerStartedAt: null,
    timerEndsAt,
    columns: [],
    canFacilitate: true,
  };
}

describe("Board timer-end trigger (DECK-005)", () => {
  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the timer-end modal only once the countdown reaches exactly 0, not before", async () => {
    vi.useFakeTimers();
    const start = new Date("2024-01-01T00:00:00.000Z");
    vi.setSystemTime(start);
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })));

    mockLoaderData.mockReturnValue(baseLoaderData(new Date(start.getTime() + 2000).toISOString()));

    const { BoardProvider } = await import("~/context/BoardContext");
    const Board = (await import("./Board")).default;

    render(
      <BoardProvider>
        <Board />
      </BoardProvider>
    );

    // Initial tick: ~2s left — not shown.
    expect(screen.queryByText(/LIFT OFF!/)).not.toBeInTheDocument();

    // 1s left — still not shown. Advancing fake timers also advances the
    // faked Date, so a single 1000ms advance moves both the interval and
    // Date.now() forward together — no manual setSystemTime needed here.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.queryByText(/LIFT OFF!/)).not.toBeInTheDocument();

    // Countdown reaches exactly 0 — modal appears.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText(/LIFT OFF!/)).toBeInTheDocument();
  });

  it("does not show the modal when the board loads with the timer already stopped", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })));
    mockLoaderData.mockReturnValue({
      id: "board-1",
      title: "Test board",
      readonly: false,
      timerRunning: false,
      timerStartedAt: null,
      timerEndsAt: null,
      columns: [],
      canFacilitate: true,
    } satisfies BoardDTO);

    const { BoardProvider } = await import("~/context/BoardContext");
    const Board = (await import("./Board")).default;

    render(
      <BoardProvider>
        <Board />
      </BoardProvider>
    );

    expect(screen.queryByText(/LIFT OFF!/)).not.toBeInTheDocument();
  });
});
