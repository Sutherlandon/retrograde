// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { SortBoardsBanner } from "./SortBoardsBanner";

describe("SortBoardsBanner", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it("renders the unassigned count and a sort call-to-action", () => {
    render(<SortBoardsBanner count={3} onSort={vi.fn()} />);
    expect(screen.getByText(/3 boards haven't joined a crew/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sort boards now/ })).toBeInTheDocument();
  });

  it("uses singular copy for one board", () => {
    render(<SortBoardsBanner count={1} onSort={vi.fn()} />);
    expect(screen.getByText(/1 board hasn't joined a crew/)).toBeInTheDocument();
  });

  it("fires onSort when the call-to-action is clicked", () => {
    const onSort = vi.fn();
    render(<SortBoardsBanner count={3} onSort={onSort} />);
    fireEvent.click(screen.getByRole("button", { name: /Sort boards now/ }));
    expect(onSort).toHaveBeenCalled();
  });

  it("renders nothing when count is zero", () => {
    const { container } = render(<SortBoardsBanner count={0} onSort={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("stays hidden after dismissal at the same count, but returns when the count changes", () => {
    const { unmount } = render(<SortBoardsBanner count={3} onSort={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Later/ }));
    expect(screen.queryByText(/joined a crew/)).toBeNull();
    unmount();

    // Same count — stays dismissed
    const second = render(<SortBoardsBanner count={3} onSort={vi.fn()} />);
    expect(screen.queryByText(/joined a crew/)).toBeNull();
    second.unmount();

    // New unassigned boards appeared — banner returns
    render(<SortBoardsBanner count={5} onSort={vi.fn()} />);
    expect(screen.getByText(/5 boards haven't joined a crew/)).toBeInTheDocument();
  });
});
