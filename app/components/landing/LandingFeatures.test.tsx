// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HowItWorks, WhatsNew } from "./LandingFeatures";

afterEach(() => cleanup());

describe("HowItWorks", () => {
  it("walks through the three steps in order", () => {
    render(<HowItWorks />);
    const steps = screen.getAllByRole("listitem").map((li) => li.querySelector("h3")?.textContent);
    expect(steps).toEqual(["Launch a board", "Your crew weighs in", "Carry it forward"]);
  });
});

describe("WhatsNew", () => {
  it("shows an attributed agent note in the board preview", () => {
    render(<WhatsNew />);
    const preview = screen.getByRole("figure");
    expect(preview).toHaveTextContent("Claude (sprint notes)");
    expect(preview).toHaveTextContent(/always attributed/);
  });
});
