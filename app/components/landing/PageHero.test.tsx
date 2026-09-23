// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PageHero from "./PageHero";

afterEach(() => cleanup());

describe("PageHero", () => {
  it("titles the page over the night sky, fading in from the header", () => {
    render(<PageHero eyebrow="About" title="About Retrograde" lede="Why it exists." />);
    const hero = screen.getByRole("heading", { level: 1, name: "About Retrograde" }).closest("section")!;
    expect(hero).toHaveClass("night-sky");
    expect(hero.querySelector('[data-testid="sky-fade"]')).toBeInTheDocument();
    expect(hero).toContainElement(screen.getByTestId("horizon"));
    expect(hero).toHaveTextContent("Why it exists.");
  });

  it("leaves out the lede when there is none", () => {
    render(<PageHero eyebrow="Contact" title="Get in touch" />);
    const hero = screen.getByRole("heading", { level: 1 }).closest("section")!;
    expect(hero.querySelectorAll("p")).toHaveLength(1);
  });
});
