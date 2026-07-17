// @vitest-environment jsdom
// app/components/TrendChart.test.tsx
// Tests for the single-series trend chart used on the admin dashboard.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import TrendChart from "./TrendChart";

const POINTS = [
  { label: "2026-06-29", value: 2 },
  { label: "2026-07-06", value: 0 },
  { label: "2026-07-13", value: 5 },
];

describe("TrendChart", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the title and description", () => {
    render(<TrendChart title="New users" description="Signups per week." points={POINTS} />);
    expect(screen.getByRole("heading", { name: "New users" })).toBeInTheDocument();
    expect(screen.getByText("Signups per week.")).toBeInTheDocument();
  });

  it("renders an SVG line for the series", () => {
    const { container } = render(
      <TrendChart title="New users" description="Signups per week." points={POINTS} />
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelectorAll("path").length).toBeGreaterThanOrEqual(2); // area + line
  });

  it("labels the chart for assistive tech", () => {
    render(<TrendChart title="New users" description="Signups per week." points={POINTS} />);
    expect(screen.getByRole("img", { name: /New users/ })).toBeInTheDocument();
  });

  it("includes a data table with every week and value", () => {
    render(<TrendChart title="New users" description="Signups per week." points={POINTS} />);
    const table = screen.getByRole("table");
    for (const point of POINTS) {
      const row = within(table).getByText(point.label).closest("tr")!;
      expect(within(row).getByText(point.value.toLocaleString())).toBeInTheDocument();
    }
  });

  it("direct-labels the latest value on the chart", () => {
    const { container } = render(
      <TrendChart title="New users" description="Signups per week." points={POINTS} />
    );
    const svgTexts = Array.from(container.querySelectorAll("svg text")).map(
      (t) => t.textContent
    );
    expect(svgTexts).toContain("5");
  });

  it("shows a readout for the latest point on keyboard focus", () => {
    render(<TrendChart title="New users" description="Signups per week." points={POINTS} />);
    fireEvent.focus(screen.getByTestId("trend-hotspot"));
    const readout = screen.getByRole("status");
    expect(readout).toHaveTextContent("5");
    expect(readout).toHaveTextContent("Jul 13");
  });

  it("moves the readout with arrow keys", () => {
    render(<TrendChart title="New users" description="Signups per week." points={POINTS} />);
    const hotspot = screen.getByTestId("trend-hotspot");
    fireEvent.focus(hotspot);
    fireEvent.keyDown(hotspot, { key: "ArrowLeft" });
    fireEvent.keyDown(hotspot, { key: "ArrowLeft" });
    const readout = screen.getByRole("status");
    expect(readout).toHaveTextContent("2");
    expect(readout).toHaveTextContent("Jun 29");
  });

  it("renders a no-data message when there are no points", () => {
    render(<TrendChart title="New users" description="Signups per week." points={[]} />);
    expect(screen.getByText(/no data yet/i)).toBeInTheDocument();
  });

  it("does not render a legend for the single series", () => {
    const { container } = render(
      <TrendChart title="New users" description="Signups per week." points={POINTS} />
    );
    expect(container.querySelector("[data-legend]")).toBeNull();
  });
});
