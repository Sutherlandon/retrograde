// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Horizon from "./Horizon";

afterEach(() => cleanup());

describe("Horizon", () => {
  it("is decorative and hidden from assistive technology", () => {
    render(<Horizon className="h-40" />);
    const svg = screen.getByTestId("horizon");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.getAttribute("class")).toContain("h-40");
  });
});
