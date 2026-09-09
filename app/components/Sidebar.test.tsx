// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import Sidebar from "./Sidebar";
import type { TeamSummary } from "~/server/team_model";

const teams: TeamSummary[] = [
  { id: "t1", name: "Personal", is_personal: true, created_at: "x", role: "owner", member_count: 1, board_count: 2, open_action_items: 0 },
  { id: "t2", name: "Design Crew", is_personal: false, created_at: "x", role: "owner", member_count: 3, board_count: 5, open_action_items: 4 },
];

function renderAt(path: string, props: React.ComponentProps<typeof Sidebar> = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar teams={teams} {...props} />
    </MemoryRouter>
  );
}

describe("Sidebar", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows Dashboard and Crews links (API keys now live on the crew page)", () => {
    renderAt("/app/dashboard");
    expect(screen.getByText("Dashboard").closest("a")).toHaveAttribute("href", "/app/dashboard");
    expect(screen.getByRole("link", { name: "Crews" })).toHaveAttribute("href", "/app/crews");
    expect(screen.queryByText("API Keys")).toBeNull();
  });

  it("hides the Admin link when isAdmin is not set", () => {
    renderAt("/app/dashboard");
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("shows the Admin link when isAdmin is true", () => {
    renderAt("/app/dashboard", { isAdmin: true });
    expect(screen.getByText("Admin").closest("a")).toHaveAttribute("href", "/app/admin/dashboard");
  });

  it("marks the current route as active", () => {
    renderAt("/app/crews");
    expect(screen.getByRole("link", { name: "Crews" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Dashboard").closest("a")).not.toHaveAttribute("aria-current");
  });

  it("calls onNavigate when a link is clicked", () => {
    const onNavigate = vi.fn();
    renderAt("/app/dashboard", { onNavigate });
    fireEvent.click(screen.getByRole("link", { name: "Crews" }));
    expect(onNavigate).toHaveBeenCalled();
  });
});

describe("Sidebar — crew selector", () => {
  afterEach(() => {
    cleanup();
  });

  it("lists every crew linking to its own page (no redundant All row)", () => {
    renderAt("/app/dashboard", { unassignedCount: 0 });
    expect(screen.queryByText("All")).toBeNull();
    expect(screen.getByText("Design Crew").closest("a")).toHaveAttribute("href", "/app/crews/t2");
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.queryByText("Manage")).toBeNull();
  });

  it("only shows Unassigned when teamless boards exist (stays a dashboard filter) (DASH-013)", () => {
    renderAt("/app/dashboard", { unassignedCount: 0 });
    expect(screen.queryByText("Unassigned")).toBeNull();
    cleanup();
    renderAt("/app/dashboard", { unassignedCount: 3 });
    expect(screen.getByText("Unassigned").closest("a")).toHaveAttribute("href", "/app/dashboard?team=unassigned");
  });

  it("marks a crew active on its own page, and nothing in Mission Control", () => {
    renderAt("/app/crews/t2");
    expect(screen.getByText("Design Crew").closest("a")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Crews" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Dashboard").closest("a")).not.toHaveAttribute("aria-current");
  });

  it("marks Mission Control's Crews link active only on the crews index", () => {
    renderAt("/app/crews");
    expect(screen.getByRole("link", { name: "Crews" })).toHaveAttribute("aria-current", "page");
  });

  it("marks Unassigned active on the dashboard's ?team=unassigned filter", () => {
    renderAt("/app/dashboard?team=unassigned", { unassignedCount: 3 });
    expect(screen.getByText("Unassigned").closest("a")).toHaveAttribute("aria-current", "page");
  });
});

describe("Sidebar — billing link (ADR-0013)", () => {
  afterEach(() => {
    cleanup();
  });

  it("hides the Billing link when the account is not subscribed", () => {
    renderAt("/app/dashboard", { isSubscribed: false });
    expect(screen.queryByText("Billing")).not.toBeInTheDocument();
  });

  it("shows a Billing link posting to the Stripe portal route when subscribed", () => {
    renderAt("/app/dashboard", { isSubscribed: true });
    const button = screen.getByRole("button", { name: "Billing" });
    const form = button.closest("form");
    expect(form).toHaveAttribute("action", "/app/billing/portal");
    expect(form).toHaveAttribute("method", "post");
  });

  it("calls onNavigate when Billing is clicked", () => {
    const onNavigate = vi.fn();
    renderAt("/app/dashboard", { isSubscribed: true, onNavigate });
    fireEvent.click(screen.getByRole("button", { name: "Billing" }));
    expect(onNavigate).toHaveBeenCalled();
  });

  it("shows an external-link icon on Billing, signaling it leaves the app for Stripe", () => {
    renderAt("/app/dashboard", { isSubscribed: true });
    const button = screen.getByRole("button", { name: "Billing" });
    expect(button.querySelectorAll("svg")).toHaveLength(2); // leading settings icon + trailing external-link icon
  });

  it("places Billing above Admin in Mission Control", () => {
    renderAt("/app/dashboard", { isSubscribed: true, isAdmin: true });
    const nav = screen.getByRole("navigation", { name: "Main" });
    const rowLabels = Array.from(nav.querySelectorAll("li")).map((li) => li.textContent?.trim());
    expect(rowLabels.indexOf("Billing")).toBeGreaterThan(-1);
    expect(rowLabels.indexOf("Billing")).toBeLessThan(rowLabels.indexOf("Admin"));
  });
});
