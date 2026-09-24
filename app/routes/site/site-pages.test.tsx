// @vitest-environment jsdom
// Render tests for the static informational pages (SITE-002). These pages
// take no props/loader data — they just need to mount without throwing and
// carry their expected heading/content.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());

describe("site pages [SITE-002]", () => {
  it("renders the About page", async () => {
    const { default: AboutPage } = await import("./about");
    render(<AboutPage />);

    expect(screen.getByRole("heading", { name: "About Retrograde", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Sutherlandon, LLC/)).toBeInTheDocument();
  });

  it("opens the About page on the night sky", async () => {
    const { default: AboutPage } = await import("./about");
    render(<AboutPage />);

    expect(screen.getByRole("heading", { level: 1 }).closest("section")).toHaveClass("night-sky");
    expect(screen.getByRole("heading", { name: "Who Built It", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /release notes/i })).toHaveAttribute(
      "href",
      "https://github.com/Sutherlandon/retrograde/releases"
    );
  });

  it("gives the About page its title and description", async () => {
    const { meta } = await import("./about");
    const tags = meta();
    expect(tags).toContainEqual({ title: "About Retrograde | Secure, Self-Hosted Retrospectives" });
    expect(tags).toContainEqual(expect.objectContaining({ name: "description" }));
  });

  it("renders the Contact page", async () => {
    const { default: ContactPage } = await import("./contact");
    render(<ContactPage />);

    expect(screen.getByRole("heading", { name: "Get in touch", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("hi@retrograde.sh")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Email hi@retrograde.sh" })).toHaveAttribute(
      "href",
      "mailto:hi@retrograde.sh"
    );
  });

  it("opens the Contact page on the night sky", async () => {
    const { default: ContactPage } = await import("./contact");
    render(<ContactPage />);

    expect(screen.getByRole("heading", { level: 1 }).closest("section")).toHaveClass("night-sky");
  });

  it("copies the address and announces it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { default: ContactPage } = await import("./contact");
    render(<ContactPage />);

    fireEvent.click(screen.getByRole("button", { name: "Copy email address to clipboard" }));
    expect(writeText).toHaveBeenCalledWith("hi@retrograde.sh");
    expect(await screen.findByRole("status")).toHaveTextContent("Copied to clipboard!");
  });

  it("titles the Contact page for Retrograde", async () => {
    const { meta } = await import("./contact");
    const tags = meta({} as never);
    expect(tags).toContainEqual({ title: "Contact Retrograde | Questions, Feedback & Self-Hosting" });
    expect(JSON.stringify(tags)).not.toMatch(/Sutherland On/);
  });

  it.each([
    ["./terms-of-service", "Terms of Service"],
    ["./privacy-policy", "Privacy Policy"],
  ])("opens %s on the night sky with its last-updated date", async (path, title) => {
    const { default: Page } = await import(/* @vite-ignore */ path);
    render(<Page />);

    const hero = screen.getByRole("heading", { name: title, level: 1 }).closest("section")!;
    expect(hero).toHaveClass("night-sky");
    expect(hero).toHaveTextContent("Last updated: 01/01/2026");
    expect(screen.getByRole("link", { name: "support@retrograde.sh" })).toHaveAttribute(
      "href",
      "mailto:support@retrograde.sh"
    );
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
