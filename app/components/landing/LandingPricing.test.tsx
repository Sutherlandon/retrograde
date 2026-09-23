// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Pricing, Faq } from "./LandingPricing";

afterEach(() => cleanup());

describe("Pricing", () => {
  it("sends the crew plan through sign-in to the crews page", () => {
    render(<Pricing />);
    expect(screen.getByRole("link", { name: "Start a crew" })).toHaveAttribute(
      "href",
      "/auth/login?returnTo=%2Fapp%2Fcrews"
    );
  });

  it("keeps the guest plan's CTA on the board form", () => {
    render(<Pricing />);
    expect(screen.getByRole("link", { name: /Create your first board/i })).toHaveAttribute("href", "#create-form");
  });
});

describe("Faq", () => {
  it("renders every question as a collapsible disclosure", () => {
    const { container } = render(<Faq />);
    expect(container.querySelectorAll("details")).toHaveLength(5);
    expect(screen.getByText(/What happens to a guest board after 30 days\?/)).toBeInTheDocument();
  });
});
