// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mockUseBoard = vi.fn();
vi.mock("~/context/BoardContext", () => ({
  useBoard: () => mockUseBoard(),
}));

// Child components pull from context / timers we don't care about here.
vi.mock("./TimerDisplay", () => ({ default: () => null }));
vi.mock("./BoardStatusBar", () => ({ BoardStatusBar: () => null }));

import BoardToolbar from "./BoardToolbar";

const baseBoard = {
  updateTitle: vi.fn(),
  canFacilitate: false,
  boardLocked: false,
  teamName: null as string | null,
};

describe("BoardToolbar — crew tag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBoard.mockReturnValue({ ...baseBoard });
  });
  afterEach(() => cleanup());

  it("shows the crew name tag at the end of the title when the board has a crew", () => {
    mockUseBoard.mockReturnValue({ ...baseBoard, teamName: "Design Crew" });
    render(<BoardToolbar title="Sprint 12 Retro" />);
    expect(screen.getByText("Sprint 12 Retro")).toBeInTheDocument();
    expect(screen.getByTestId("board-crew-tag").textContent).toBe("Design Crew");
  });

  it("renders no crew tag for a teamless board", () => {
    mockUseBoard.mockReturnValue({ ...baseBoard, teamName: null });
    render(<BoardToolbar title="Sprint 12 Retro" />);
    expect(screen.queryByTestId("board-crew-tag")).toBeNull();
  });
});
