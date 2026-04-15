// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { VotingInfoModal } from "./VotingInfoModal";

describe("VotingInfoModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when not open", () => {
    const { container } = render(<VotingInfoModal isOpen={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders modal content when open", () => {
    render(<VotingInfoModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText("Like Mode")).toBeInTheDocument();
    expect(screen.getByText("Voting Mode")).toBeInTheDocument();
  });

  it("describes like mode as unlimited likes and unlimited notes", () => {
    render(<VotingInfoModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText(/Unlimited likes/)).toBeInTheDocument();
    expect(screen.getByText(/Like as many notes as you want/)).toBeInTheDocument();
  });

  it("describes voting mode with scopes", () => {
    render(<VotingInfoModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText("Per Board")).toBeInTheDocument();
    expect(screen.getByText("Per Column")).toBeInTheDocument();
    expect(screen.getByText("Per Note")).toBeInTheDocument();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<VotingInfoModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("voting-info-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Acknowledged button is clicked", () => {
    const onClose = vi.fn();
    render(<VotingInfoModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("Acknowledged"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
