// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CommandDeckToggle } from "./CommandDeckToggle";

describe("CommandDeckToggle", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders label text", () => {
    render(<CommandDeckToggle label="Voting" checked={false} onChange={() => {}} ledColor="blue" />);
    expect(screen.getByText("Voting")).toBeInTheDocument();
  });

  it("shows active LED when checked", () => {
    const { container } = render(<CommandDeckToggle label="Test" checked={true} onChange={() => {}} ledColor="green" />);
    const led = container.querySelector(".bg-green-400");
    expect(led).toBeInTheDocument();
  });

  it("calls onChange when toggle clicked", () => {
    const onChange = vi.fn();
    render(<CommandDeckToggle label="Test" checked={false} onChange={onChange} ledColor="blue" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not call onChange when disabled", () => {
    const onChange = vi.fn();
    render(<CommandDeckToggle label="Test" checked={false} onChange={onChange} ledColor="blue" disabled />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
