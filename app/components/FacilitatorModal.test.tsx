// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const mockSubmit = vi.fn();
const mockLoad = vi.fn();
let mockFetcherData: unknown = null;
let mockFetcherState: "idle" | "loading" | "submitting" = "idle";
vi.mock("react-router", () => ({
  useFetcher: () => ({
    submit: mockSubmit,
    load: mockLoad,
    data: mockFetcherData,
    state: mockFetcherState,
  }),
  useLocation: () => ({ pathname: "/app/board/b1" }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}));

// teamName === null means a crewless board — GAP-002's invariant means the
// open-facilitation toggle must not even be reachable from this UI there.
let mockTeamName: string | null = "Acme Crew";
vi.mock("~/context/BoardContext", () => ({
  useBoard: () => ({ teamName: mockTeamName }),
}));

// Drives DECK-022's crewless CTA — anonymous/no user vs. registered viewer.
const mockUseOptionalUser = vi.fn();
vi.mock("~/context/userContext", () => ({
  useOptionalUser: () => mockUseOptionalUser(),
}));

import { FacilitatorModal } from "./FacilitatorModal";

describe("FacilitatorModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTeamName = "Acme Crew";
    mockFetcherState = "idle";
    mockFetcherData = {
      facilitators: [
        { user_id: "u1", role: "owner", username: "landon" },
        { user_id: "u2", role: "facilitator", username: "sam" },
      ],
      openFacilitation: false,
    };
    mockUseOptionalUser.mockReturnValue({ id: "u1", username: "landon", is_anonymous: false });
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

  // GAP-002 / DECK-008 / DECK-022: the invariant is enforced server-side too
  // (setOpenFacilitationServer refuses the write), but the control — and the
  // now-meaningless FACILITATORS list and GRANT ACCESS form — shouldn't even
  // be offered on a crewless board, where everyone with the link already
  // facilitates.
  it("DECK-022: hides the open-facilitation toggle, facilitator list, and grant form on a crewless board and explains why", () => {
    mockTeamName = null;
    render(<FacilitatorModal boardId="b1" isOpen onClose={() => {}} />);
    expect(screen.queryByText("Open Deck to Everyone")).toBeNull();
    expect(screen.queryByText("Facilitators")).toBeNull();
    expect(screen.queryByPlaceholderText("Username")).toBeNull();
    expect(screen.queryByText("Grant")).toBeNull();
    expect(
      screen.getByText(/this board is anonymous/i)
    ).toBeInTheDocument();
  });

  it("DECK-022: crewless + anonymous viewer sees a link to create an account and claim the board", () => {
    mockTeamName = null;
    mockUseOptionalUser.mockReturnValue(null);
    render(<FacilitatorModal boardId="b1" isOpen onClose={() => {}} />);
    const link = screen.getByText("Create an account to claim this board");
    expect(link.getAttribute("href")).toContain("/auth/login?returnTo=");
  });

  it("DECK-022: crewless + registered viewer is told to claim from the toolbar, with no login link or grant form", () => {
    mockTeamName = null;
    mockUseOptionalUser.mockReturnValue({ id: "u1", username: "landon", is_anonymous: false });
    render(<FacilitatorModal boardId="b1" isOpen onClose={() => {}} />);
    expect(
      screen.getByText(/claim this board from the toolbar/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Create an account to claim this board")).toBeNull();
    expect(screen.queryByPlaceholderText("Username")).toBeNull();
  });

  it("shows the open-facilitation toggle on a board that belongs to a crew", () => {
    mockTeamName = "Acme Crew";
    render(<FacilitatorModal boardId="b1" isOpen onClose={() => {}} />);
    expect(screen.getByText("Open Deck to Everyone")).toBeInTheDocument();
  });

  it("DECK-020: shows None in the facilitator list when a crew board has no facilitators after load, with the grant form present", () => {
    mockTeamName = "Acme Crew";
    mockFetcherState = "idle";
    mockFetcherData = { facilitators: [], openFacilitation: false };
    render(<FacilitatorModal boardId="b1" isOpen onClose={() => {}} />);
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Username")).toBeInTheDocument();
    expect(screen.getByText("Grant")).toBeInTheDocument();
  });
});
