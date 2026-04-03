// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusLED } from "./StatusLED";

describe("StatusLED", () => {
  it("renders with active color", () => {
    const { container } = render(<StatusLED color="green" active />);
    expect(container.firstChild).toHaveClass("bg-green-400");
  });

  it("renders gray when inactive", () => {
    const { container } = render(<StatusLED color="green" active={false} />);
    expect(container.firstChild).toHaveClass("bg-gray-600");
  });

  it("adds pulse animation when active and pulse is true", () => {
    const { container } = render(<StatusLED color="blue" active pulse />);
    expect(container.firstChild).toHaveClass("animate-pulse");
  });

  it("does not pulse when inactive", () => {
    const { container } = render(<StatusLED color="blue" active={false} pulse />);
    expect(container.firstChild).not.toHaveClass("animate-pulse");
  });

  it("defaults to md size", () => {
    const { container } = render(<StatusLED color="red" active />);
    expect(container.firstChild).toHaveClass("w-2.5", "h-2.5");
  });

  it("renders sm size", () => {
    const { container } = render(<StatusLED color="red" active size="sm" />);
    expect(container.firstChild).toHaveClass("w-2", "h-2");
  });
});
