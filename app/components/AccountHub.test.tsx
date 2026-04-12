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

vi.mock("~/config/siteConfig", () => ({
  siteConfig: { dashboardHome: false },
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

  it("shows admin dashboard link when isAdmin is true", () => {
    render(<AccountHub user={user} isAdmin={true} />);
    // Open the dropdown
    fireEvent.click(screen.getByText("testuser"));
    expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Admin Dashboard").closest("a")).toHaveAttribute(
      "href",
      "/app/admin/dashboard"
    );
  });

  it("does not show admin dashboard link when isAdmin is false", () => {
    render(<AccountHub user={user} isAdmin={false} />);
    fireEvent.click(screen.getByText("testuser"));
    expect(screen.queryByText("Admin Dashboard")).not.toBeInTheDocument();
  });

  it("does not show admin dashboard link when isAdmin is not provided", () => {
    render(<AccountHub user={user} />);
    fireEvent.click(screen.getByText("testuser"));
    expect(screen.queryByText("Admin Dashboard")).not.toBeInTheDocument();
  });

  it("shows dashboard link regardless of admin status", () => {
    render(<AccountHub user={user} isAdmin={false} />);
    fireEvent.click(screen.getByText("testuser"));
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
