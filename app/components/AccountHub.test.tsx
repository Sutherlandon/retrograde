// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("~/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    setTheme: vi.fn(),
  }),
}));

import AccountHub from "./AccountHub";

const user = { id: "user-1", username: "testuser" };

describe("AccountHub", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the theme switcher when opened", () => {
    render(<AccountHub user={user} hideLogout={false} />);
    fireEvent.click(screen.getByText("testuser"));
    expect(screen.getByText("Theme")).toBeInTheDocument();
  });

  it("shows a logout link when opened", () => {
    render(<AccountHub user={user} hideLogout={false} />);
    fireEvent.click(screen.getByText("testuser"));
    expect(screen.getByText("Logout").closest("a")).toHaveAttribute("href", "/auth/logout");
  });

  // ADR-0017: an SSO deployment that signs users straight back in sets
  // HIDE_LOGOUT=true, because a logout button there only bounces the user.
  it("offers no logout when the deployment hides it [AUTH-003]", () => {
    render(<AccountHub user={user} hideLogout={true} />);
    fireEvent.click(screen.getByText("testuser"));
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.queryByText("Logout")).not.toBeInTheDocument();
  });

  it("does not show navigation links — those live in the Sidebar now", () => {
    render(<AccountHub user={user} hideLogout={false} />);
    fireEvent.click(screen.getByText("testuser"));
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Teams")).not.toBeInTheDocument();
    expect(screen.queryByText("API Keys")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin Dashboard")).not.toBeInTheDocument();
  });

  // Page content (the landing hero and its create-board form) sits at z-10, so
  // the dropdown has to stack above that or the form paints over it.
  it("stacks the dropdown above page content", () => {
    render(<AccountHub user={user} hideLogout={false} />);
    fireEvent.click(screen.getByText("testuser"));
    const container = screen.getByRole("menu").parentElement!;
    const zIndex = Number(container.className.match(/\bz-(\d+)\b/)?.[1]);
    expect(zIndex).toBeGreaterThan(10);
  });

  // The Command Deck tops out at z-50 and would otherwise cover the menu on a board.
  it("stacks the open dropdown above the Command Deck, and only while open", () => {
    render(<AccountHub user={user} hideLogout={false} />);
    const container = screen.getByRole("menu", { hidden: true }).parentElement!;
    const zIndex = () => Number(container.className.match(/\bz-(\d+)\b/)?.[1]);
    expect(zIndex()).toBeLessThanOrEqual(50);

    fireEvent.click(screen.getByText("testuser"));

    expect(zIndex()).toBeGreaterThan(50);
  });

  it("opens the hotkeys modal from the menu and closes the dropdown [SITE-009]", () => {
    render(<AccountHub user={user} hideLogout={false} />);
    fireEvent.click(screen.getByText("testuser"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hotkeys" }));

    expect(screen.getByRole("dialog", { name: "Hotkeys" })).toBeInTheDocument();
    expect(screen.getByRole("menu", { hidden: true }).className).toMatch(/pointer-events-none/);
  });

  it("returns focus to the account button when the hotkeys modal closes", () => {
    render(<AccountHub user={user} hideLogout={false} />);
    fireEvent.click(screen.getByText("testuser"));
    fireEvent.click(screen.getByRole("button", { name: "Hotkeys" }));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("testuser").closest("button")).toHaveFocus();
  });

  it("gives Hotkeys and Logout an icon", () => {
    render(<AccountHub user={user} hideLogout={false} />);
    fireEvent.click(screen.getByText("testuser"));
    expect(screen.getByText("Hotkeys").closest("button")!.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("Logout").closest("a")!.querySelector("svg")).not.toBeNull();
  });

  it("closes on Esc and returns focus to the account button", () => {
    render(<AccountHub user={user} hideLogout={false} />);
    fireEvent.click(screen.getByText("testuser"));

    fireEvent.keyDown(document.body, { key: "Escape" });

    const button = screen.getByText("testuser").closest("button");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  // Esc also cancels an edit on the board, which must not lose the user's place.
  it("leaves focus alone on Esc while closed", () => {
    render(<><input aria-label="Elsewhere" /><AccountHub user={user} hideLogout={false} /></>);
    screen.getByLabelText("Elsewhere").focus();

    fireEvent.keyDown(screen.getByLabelText("Elsewhere"), { key: "Escape" });

    expect(screen.getByLabelText("Elsewhere")).toHaveFocus();
  });

  it("shows a login button when no user is present", () => {
    render(<AccountHub hideLogout={false} />);
    expect(screen.getByText("Log In").closest("a")).toHaveAttribute("href", "/auth/login");
  });
});
