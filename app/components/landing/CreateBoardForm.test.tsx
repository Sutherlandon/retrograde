// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

vi.mock("react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children?: React.ReactNode }) =>
    React.createElement("a", { href: to, ...rest }, children),
  Form: ({ children, ...rest }: { children?: React.ReactNode }) =>
    React.createElement("form", { ...rest }, children),
}));

import CreateBoardForm from "./CreateBoardForm";
import { CREATE_FORM_ID } from "./CreateBoardLink";

afterEach(() => cleanup());

describe("CreateBoardForm [SITE-003]", () => {
  it("posts the title, kindness checkbox and honeypot", () => {
    const { container } = render(<CreateBoardForm />);
    const form = container.querySelector("form")!;
    expect(form).toHaveAttribute("method", "post");
    expect(form.querySelector("input[name=title]")).toBeInTheDocument();
    expect(form.querySelector("input[name=no_jerks][type=checkbox]")).toBeInTheDocument();
    expect(form.querySelector("input[name=website]")).toHaveAttribute("tabindex", "-1");
    expect(container.firstElementChild).toHaveAttribute("id", CREATE_FORM_ID);
  });

  it("shows both validation errors and marks the title invalid", () => {
    render(<CreateBoardForm errors={{ title: "Too short", no_jerks: "Agree first" }} />);
    expect(screen.getByText("Too short")).toBeInTheDocument();
    expect(screen.getByText("Agree first")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  });

  it("links the terms and privacy policy", () => {
    render(<CreateBoardForm />);
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms-of-service");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy-policy");
  });

  it("puts the kindness pledge first in the agreement", () => {
    render(<CreateBoardForm />);
    expect(screen.getByRole("checkbox")).toHaveAccessibleName(
      "I agree to treat others the way I want to be treated and to the Terms of Service and Privacy Policy"
    );
  });
});

describe("CreateBoardForm palette", () => {
  it("launches with the night-sky airglow, not the app's green-to-blue", () => {
    render(<CreateBoardForm />);
    const launch = screen.getByRole("button", { name: /Launch/i });
    expect(launch.className).toMatch(/airglow/);
    expect(launch.className).not.toMatch(/green-|blue-/);
  });
});
