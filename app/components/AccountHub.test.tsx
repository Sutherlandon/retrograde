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

  it("shows a login button when no user is present", () => {
    render(<AccountHub hideLogout={false} />);
    expect(screen.getByText("Log In").closest("a")).toHaveAttribute("href", "/auth/login");
  });
});
