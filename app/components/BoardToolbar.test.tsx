// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const mockUseBoard = vi.fn();
vi.mock("~/context/BoardContext", () => ({
  useBoard: () => mockUseBoard(),
}));

const mockUseOptionalUser = vi.fn();
vi.mock("~/context/userContext", () => ({
  useOptionalUser: () => mockUseOptionalUser(),
}));

const mockSubmit = vi.fn();
const mockRevalidate = vi.fn();
let mockFetcherData: { error?: string; success?: boolean } | null = null;
let mockFetcherState: "idle" | "submitting" | "loading" = "idle";
vi.mock("react-router", () => ({
  useFetcher: () => ({ submit: mockSubmit, data: mockFetcherData, state: mockFetcherState }),
  useLocation: () => ({ pathname: "/app/board/board-1" }),
  useRevalidator: () => ({ revalidate: mockRevalidate }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
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
  hasOwner: true,
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

// BRD-020: the primary claim affordance — a control on the board itself,
// shown only when the board has no owner (GAP-002).
describe("BoardToolbar — claim board control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetcherData = null;
    mockFetcherState = "idle";
    mockUseBoard.mockReturnValue({ ...baseBoard, hasOwner: false });
    mockUseOptionalUser.mockReturnValue({ id: "u1", username: "landon", is_anonymous: false });
  });
  afterEach(() => cleanup());

  it("renders nothing when hasOwner is true", () => {
    mockUseBoard.mockReturnValue({ ...baseBoard, hasOwner: true });
    render(<BoardToolbar title="Sprint 12 Retro" />);
    expect(screen.queryByText("Claim this board")).toBeNull();
    expect(screen.queryByText("Log in to claim this board")).toBeNull();
  });

  it("shows a claim button that submits a fetcher POST for a registered user", () => {
    render(<BoardToolbar title="Sprint 12 Retro" />);
    const button = screen.getByText("Claim this board");
    fireEvent.click(button);
    expect(mockSubmit).toHaveBeenCalledWith(
      { boardLink: expect.any(String) },
      { method: "POST", action: "/app/board/claim" }
    );
  });

  it("shows a login link with returnTo for an anonymous session", () => {
    mockUseOptionalUser.mockReturnValue({ id: "anon-1", username: "Guest", is_anonymous: true });
    render(<BoardToolbar title="Sprint 12 Retro" />);
    expect(screen.queryByText("Claim this board")).toBeNull();
    const link = screen.getByText("Log in to claim this board").closest("a");
    expect(link).toHaveAttribute("href", "/auth/login?returnTo=%2Fapp%2Fboard%2Fboard-1");
  });

  it("shows a login link with returnTo when there is no session at all", () => {
    mockUseOptionalUser.mockReturnValue(null);
    render(<BoardToolbar title="Sprint 12 Retro" />);
    const link = screen.getByText("Log in to claim this board").closest("a");
    expect(link).toHaveAttribute("href", "/auth/login?returnTo=%2Fapp%2Fboard%2Fboard-1");
  });

  it("shows an inline error from a failed claim attempt", () => {
    mockFetcherData = { error: "This board already has an owner and cannot be claimed." };
    render(<BoardToolbar title="Sprint 12 Retro" />);
    expect(
      screen.getByText("This board already has an owner and cannot be claimed.")
    ).toBeInTheDocument();
  });

  it("revalidates so the next render reflects the new owner after a successful claim", () => {
    mockFetcherData = { success: true };
    render(<BoardToolbar title="Sprint 12 Retro" />);
    expect(mockRevalidate).toHaveBeenCalled();
  });
});
