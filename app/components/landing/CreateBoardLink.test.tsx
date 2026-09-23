// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import CreateBoardLink, { CREATE_FORM_ID } from "./CreateBoardLink";

afterEach(() => cleanup());

describe("CreateBoardLink", () => {
  it("links to the board form without needing JavaScript", () => {
    render(<CreateBoardLink />);
    expect(screen.getByRole("link", { name: /Create your first board/i })).toHaveAttribute(
      "href",
      `#${CREATE_FORM_ID}`
    );
  });

  it("puts the cursor in the board title field", async () => {
    render(
      <>
        <CreateBoardLink />
        <input id="title" aria-label="Title" />
      </>
    );
    fireEvent.click(screen.getByRole("link", { name: /Create your first board/i }));
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveFocus());
  });
});
