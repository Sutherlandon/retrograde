// @vitest-environment jsdom
// app/components/GuestNotices.test.tsx
// The one line under a board for each viewer: whoever can keep a crewless
// board is told how long it is kept and how to keep it; a guest who joined
// someone else's board is invited to start their own. Nobody gets both.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ClaimReminder, GuestFooter, KeepNotice, StartYourOwnBoard, guestFooterFor } from "./GuestNotices";

afterEach(() => cleanup());

const ARCHIVES_AT = "2026-11-04T14:30:00.000Z";

describe("guestFooterFor", () => {
  const guestCreator = { isGuest: true, isReadOnly: false, isCreator: true, hasArchiveDate: true, hasOwner: false, isOwner: false };
  const signedIn = { ...guestCreator, isGuest: false, isCreator: false };

  it("tells the guest who started a crewless board how long it is kept", () => {
    expect(guestFooterFor(guestCreator)).toBe("keep");
  });

  it("reminds the guest who started a board that never expires to claim it", () => {
    expect(guestFooterFor({ ...guestCreator, hasArchiveDate: false })).toBe("claim");
  });

  it("only invites a guest who joined someone else's board, whatever its archive date", () => {
    expect(guestFooterFor({ ...guestCreator, isCreator: false })).toBe("invite");
    expect(guestFooterFor({ ...guestCreator, isCreator: false, hasArchiveDate: false })).toBe("invite");
  });

  it("invites a signed-out visitor on an example board, and shows a signed-in one nothing", () => {
    expect(guestFooterFor({ ...guestCreator, isReadOnly: true })).toBe("invite");
    expect(guestFooterFor({ ...signedIn, isReadOnly: true })).toBeNull();
  });

  it("tells a signed-in user on an unclaimed crewless board how long it is kept", () => {
    expect(guestFooterFor(signedIn)).toBe("keep");
  });

  it("tells the owner of a crewless board how long it is kept", () => {
    expect(guestFooterFor({ ...signedIn, hasOwner: true, isOwner: true })).toBe("keep");
  });

  it("shows nothing to a signed-in user who can do nothing about it", () => {
    expect(guestFooterFor({ ...signedIn, hasOwner: true })).toBeNull();
    expect(guestFooterFor({ ...signedIn, hasArchiveDate: false })).toBeNull();
  });
});

describe("KeepNotice", () => {
  it("tells a guest how long their guest board is kept and to log in and claim it, returning them to it", () => {
    render(<KeepNotice archivesAt={ARCHIVES_AT} boardId="board-1" isGuest isOwner={false} />);

    expect(screen.getByText(/This guest board is kept until November 4\./).textContent).toContain(
      "Log in and claim it to keep it for good."
    );
    // The ref lets the login route count this click (keep_click).
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe(
      "/auth/login?returnTo=%2Fapp%2Fboard%2Fboard-1&ref=keep-notice"
    );
  });

  it("tells a signed-in user to claim it", () => {
    render(<KeepNotice archivesAt={ARCHIVES_AT} boardId="board-1" isGuest={false} isOwner={false} />);

    expect(screen.getByText(/This board is kept until November 4\./).textContent).toContain("Claim it to keep it for good.");
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
  });

  it("tells the owner to move it to a crew", () => {
    render(<KeepNotice archivesAt={ARCHIVES_AT} boardId="board-1" isGuest={false} isOwner />);

    expect(screen.getByText(/This board is kept until November 4\./).textContent).toContain(
      "Move it to a crew to keep it for good."
    );
  });

  it("states the date in UTC, so the server render and the browser agree", () => {
    render(<KeepNotice archivesAt="2026-11-04T23:30:00.000Z" boardId="board-1" isGuest isOwner={false} />);

    expect(screen.getByText(/kept until November 4\./)).toBeTruthy();
  });
});

describe("StartYourOwnBoard", () => {
  it("links to the homepage form, carrying the board it came from so the click and any board created can be counted", () => {
    render(<StartYourOwnBoard boardId="board-1" />);

    expect(screen.getByText(/Want Retrograde for your own team\?/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start a free board" }).getAttribute("href")).toBe(
      "/?ref=board-invite&from=board-1#create-form"
    );
  });
});

describe("ClaimReminder", () => {
  it("tags its Log in link so the login route can count it apart from the keep notice", () => {
    render(<ClaimReminder boardId="board-1" />);

    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe(
      "/auth/login?returnTo=%2Fapp%2Fboard%2Fboard-1&ref=claim-reminder"
    );
  });
});

describe("GuestFooter", () => {
  const base = { boardId: "board-1", isReadOnly: false, hasOwner: false, isOwner: false, archivesAt: ARCHIVES_AT };

  it("shows the guest who started the board how long it is kept, and no invite", () => {
    render(<GuestFooter {...base} isGuest isCreator />);

    expect(screen.getByText(/kept until November 4/)).toBeTruthy();
    expect(screen.queryByText(/Start a free board/)).toBeNull();
    expect(screen.queryByText(/You are using this board anonymously/)).toBeNull();
  });

  it("shows a guest who joined only the invite, with no mention of an account or the archive date", () => {
    render(<GuestFooter {...base} isGuest isCreator={false} />);

    expect(screen.getByText(/Start a free board/)).toBeTruthy();
    expect(screen.queryByText(/kept until/)).toBeNull();
    expect(screen.queryByText(/Log in/)).toBeNull();
  });

  it("keeps the claim reminder for the guest who started a board that never expires", () => {
    render(<GuestFooter {...base} archivesAt={null} isGuest isCreator />);

    expect(screen.getByText(/You are using this board anonymously/)).toBeTruthy();
  });

  it("renders nothing for a signed-in user on someone else's board", () => {
    const { container } = render(<GuestFooter {...base} hasOwner isGuest={false} isCreator={false} />);

    expect(container.textContent).toBe("");
  });
});
