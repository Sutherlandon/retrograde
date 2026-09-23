// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HowItWorks, IdeaBoards, WhatsNew } from "./LandingFeatures";

afterEach(() => cleanup());

describe("HowItWorks", () => {
  it("walks through the three steps in order", () => {
    render(<HowItWorks />);
    const steps = screen.getAllByRole("listitem").map((li) => li.querySelector("h3")?.textContent);
    expect(steps).toEqual(["Launch a board", "Your crew weighs in", "Carry it forward"]);
  });

  it("sets each step's number on the same line as its title", () => {
    render(<HowItWorks />);
    screen.getAllByRole("listitem").forEach((li, i) => {
      const row = li.querySelector("h3")!.parentElement!;
      expect(row).not.toBe(li);
      expect(row).toHaveClass("flex", "items-center");
      expect(row).toHaveTextContent(`0${i + 1}`);
    });
  });
});

describe("WhatsNew", () => {
  it("promises that AI crewmate notes are always labeled", () => {
    render(<WhatsNew />);
    const card = screen.getByRole("heading", { name: "AI crewmates", level: 3 }).closest("article");
    expect(card).toHaveTextContent(/always labeled/);
  });

  it("shows only the four feature cards, no decorative board preview", () => {
    render(<WhatsNew />);
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
  });

  it("marks action items with a filled circle check", () => {
    render(<WhatsNew />);
    const card = screen.getByRole("heading", { name: "Action items", level: 3 }).closest("article")!;
    expect(card.querySelector("svg")).toHaveAttribute("data-icon", "check-circle-filled");
  });

  it("sets each card's icon on the same line as its title", () => {
    render(<WhatsNew />);
    for (const article of screen.getAllByRole("article")) {
      const row = article.querySelector("h3")!.parentElement!;
      expect(row).not.toBe(article);
      expect(row).toHaveClass("flex", "items-center");
      expect(row).toContainElement(article.querySelector("svg"));
    }
  });
});

describe("IdeaBoards", () => {
  it("pitches the board for brainstorming, not just retros", () => {
    render(<IdeaBoards />);
    const section = screen.getByRole("region", { name: /idea board/i });
    expect(section).toHaveTextContent(/brainstorm/i);
  });

  it("puts AI agents in the brainstorm alongside the team", () => {
    render(<IdeaBoards />);
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["Brainstorm together", "Let agents fill the board", "Vote, then hand it back"]);
    const agentCard = screen.getByRole("heading", { name: "Let agents fill the board" }).closest("article");
    expect(agentCard).toHaveTextContent(/labeled/);
  });
});
