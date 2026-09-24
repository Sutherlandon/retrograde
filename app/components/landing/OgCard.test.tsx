// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import OgCard from "./OgCard";

afterEach(() => cleanup());

describe("OgCard", () => {
  it("is exactly the 1200×630 link-preview size", () => {
    render(<OgCard />);
    expect(screen.getByTestId("og-card")).toHaveClass("w-[1200px]", "h-[630px]");
  });

  it("carries the brand and the homepage headline", () => {
    render(<OgCard />);
    expect(screen.getByText("Retrograde")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Retros your whole crew shows up for. People and Agents."
    );
  });

  it("sits on the night sky and mountain horizon", () => {
    render(<OgCard />);
    expect(screen.getByTestId("og-card")).toHaveClass("night-sky");
    expect(screen.getByTestId("horizon")).toBeInTheDocument();
  });

  it("has nothing that looks clickable, since a preview image cannot be clicked into", () => {
    render(<OgCard />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
