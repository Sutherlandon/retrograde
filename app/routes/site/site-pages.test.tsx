// @vitest-environment jsdom
// Render tests for the static informational pages (SITE-002). These pages
// take no props/loader data — they just need to mount without throwing and
// carry their expected heading/content.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());

describe("site pages [SITE-002]", () => {
  it("renders the About page", async () => {
    const { default: AboutPage } = await import("./about");
    render(<AboutPage />);

    expect(screen.getByRole("heading", { name: "About Retrograde", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Sutherlandon, LLC/)).toBeInTheDocument();
  });

  it("renders the Contact page", async () => {
    const { default: ContactPage } = await import("./contact");
    render(<ContactPage />);

    expect(screen.getByRole("heading", { name: "Get in touch", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("hi@retrograde.sh")).toBeInTheDocument();
    const emailLink = screen
      .getAllByLabelText("Copy email address to clipboard")
      .find((el) => el.tagName === "A");
    expect(emailLink).toHaveAttribute("href", "mailto:hi@retrograde.sh");
  });

  it("renders the Terms of Service page", async () => {
    const { default: TermsOfService } = await import("./terms-of-service");
    render(<TermsOfService />);

    expect(screen.getByRole("heading", { name: "Terms of Service", level: 1 })).toBeInTheDocument();
  });

  it("renders the Privacy Policy page", async () => {
    const { default: PrivacyPolicy } = await import("./privacy-policy");
    render(<PrivacyPolicy />);

    expect(screen.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeInTheDocument();
  });
});
