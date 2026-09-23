// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import LegalPage from "./LegalPage";

afterEach(() => cleanup());

describe("LegalPage", () => {
  it("heads the document with its title and last-updated date", () => {
    render(<LegalPage title="Terms of Service" updated="01/01/2026"><p>Be kind.</p></LegalPage>);
    const hero = screen.getByRole("heading", { level: 1, name: "Terms of Service" }).closest("section")!;
    expect(hero).toHaveTextContent("Last updated: 01/01/2026");
  });

  it("sets the document itself in an article, bullets and all", () => {
    render(<LegalPage title="Privacy Policy" updated="01/01/2026"><ul><li>Your notes</li></ul></LegalPage>);
    const article = screen.getByRole("article");
    expect(article).toHaveTextContent("Your notes");
    expect(article.className).toContain("[&_ul]:list-disc");
  });
});
