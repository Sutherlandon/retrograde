// @vitest-environment jsdom
// DASH-017: dismissing the welcome banner. Dismissal is persisted to
// localStorage per-banner-id (see WelcomeBanner.tsx's STORAGE_KEY) and
// honored on the next render/mount.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { WelcomeBanner } from "./WelcomeBanner";

describe("WelcomeBanner (DASH-017)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => cleanup());

  it("renders by default when not previously dismissed", () => {
    render(<WelcomeBanner id="test-banner" title="Welcome!" message="Hello there." />);
    expect(screen.getByText("Welcome!")).toBeInTheDocument();
    expect(screen.getByText("Hello there.")).toBeInTheDocument();
  });

  it("hides the banner when the Dismiss control is clicked", () => {
    render(<WelcomeBanner id="test-banner" title="Welcome!" message="Hello there." />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Welcome!")).not.toBeInTheDocument();
  });

  it("persists dismissal to localStorage under a per-id key", () => {
    render(<WelcomeBanner id="test-banner" title="Welcome!" message="Hello there." />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(localStorage.getItem("welcome_dismissed:test-banner")).toBe("true");
  });

  it("honors a prior dismissal on the next render/mount", () => {
    localStorage.setItem("welcome_dismissed:test-banner", "true");
    render(<WelcomeBanner id="test-banner" title="Welcome!" message="Hello there." />);
    expect(screen.queryByText("Welcome!")).not.toBeInTheDocument();
  });

  it("dismissal of one banner id does not hide a banner with a different id", () => {
    localStorage.setItem("welcome_dismissed:other-banner", "true");
    render(<WelcomeBanner id="test-banner" title="Welcome!" message="Hello there." />);
    expect(screen.getByText("Welcome!")).toBeInTheDocument();
  });
});
