// @vitest-environment jsdom
// app/components/GuestNotices.test.tsx
// What a guest is told on a board: when it will be archived, and, if they
// did not start it, how to run their own team's retro.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ArchiveNotice, StartYourOwnBoard, guestFooterFor } from "./GuestNotices";

afterEach(() => cleanup());

const archive = { archivesAt: "2026-11-04T14:30:00.000Z", boardId: "board-1", hasOwner: false, isOwner: false };

describe("ArchiveNotice", () => {
  it("tells a guest the date and to log in and claim the board, returning them to it", () => {
    render(<ArchiveNotice {...archive} isGuest />);

    expect(screen.getByRole("status").textContent).toContain("This board will be archived after November 4.");
    expect(screen.getByRole("status").textContent).toContain("Log in and claim it to keep it.");
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe(
      "/auth/login?returnTo=%2Fapp%2Fboard%2Fboard-1"
    );
  });

  it("tells a signed-in visitor on an unclaimed board to claim it", () => {
    render(<ArchiveNotice {...archive} isGuest={false} />);

    expect(screen.getByRole("status").textContent).toContain("Claim it to keep it.");
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
  });

  it("tells the owner of a crewless board to move it to a crew", () => {
    render(<ArchiveNotice {...archive} isGuest={false} hasOwner isOwner />);

    expect(screen.getByRole("status").textContent).toContain("Move it to a crew to keep it.");
  });

  it("gives a signed-in non-owner of an owned board only the date, since they can do nothing about it", () => {
    render(<ArchiveNotice {...archive} isGuest={false} hasOwner />);

    expect(screen.getByRole("status").textContent).toBe("This board will be archived after November 4.");
  });

  it("states the date in UTC, so the server render and the browser agree", () => {
    render(<ArchiveNotice {...archive} archivesAt="2026-11-04T23:30:00.000Z" isGuest />);

    expect(screen.getByRole("status").textContent).toContain("after November 4.");
  });
});

describe("StartYourOwnBoard", () => {
  it("links to the homepage form to start a free board", () => {
    render(<StartYourOwnBoard />);

    expect(screen.getByText(/Want Retrograde for your own team\?/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start a free board" }).getAttribute("href")).toBe("/#create-form");
  });
});

describe("guestFooterFor", () => {
  const guest = { isGuest: true, isReadOnly: false, isCreator: true, hasArchiveNotice: false };

  it("shows nothing to a signed-in user", () => {
    expect(guestFooterFor({ ...guest, isGuest: false })).toBeNull();
    expect(guestFooterFor({ ...guest, isGuest: false, isCreator: false })).toBeNull();
  });

  it("invites a guest who did not start the board to run their own", () => {
    expect(guestFooterFor({ ...guest, isCreator: false })).toBe("invite");
  });

  it("invites a guest looking at an example board", () => {
    expect(guestFooterFor({ ...guest, isReadOnly: true })).toBe("invite");
  });

  it("reminds the guest who started the board to claim it", () => {
    expect(guestFooterFor(guest)).toBe("claim");
  });

  it("leaves the claim reminder to the archive notice when one is showing", () => {
    expect(guestFooterFor({ ...guest, hasArchiveNotice: true })).toBeNull();
  });
});
