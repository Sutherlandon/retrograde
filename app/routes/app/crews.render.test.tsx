// @vitest-environment jsdom
// app/routes/app/crews.render.test.tsx
// CREW-002: the crews page CTA where the paid-tier gate bites. When the
// account isn't entitled, the create-crew form is replaced entirely by a
// subscribe explainer; once entitled (and billing is on file), the create
// form and a "Manage billing" link both show. A successful Checkout
// round-trip (?checkout=success) surfaces a confirmation pill.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { TeamSummary } from "~/server/team_model";

const mockLoaderData = vi.fn();
const mockSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("react-router", () => ({
  useLoaderData: () => mockLoaderData(),
  useSearchParams: () => [mockSearchParams(), vi.fn()],
  useNavigate: () => vi.fn(),
  useFetcher: () => ({
    Form: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <form {...props}>{children}</form>
    ),
    submit: vi.fn(),
    data: null,
    state: "idle" as const,
  }),
  Form: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <form {...props}>{children}</form>
  ),
  redirect: vi.fn(),
}));

vi.mock("~/components/StatusLED", () => ({ StatusLED: () => null }));

// crews.tsx pulls in the full server graph via its loader/action exports —
// same reasoning dashboard.unassigned-empty.test.tsx documents.
vi.mock("~/hooks/useAuth", () => ({ requireRegisteredUser: vi.fn() }));
vi.mock("~/server/team_model", () => ({ createTeam: vi.fn(), listTeamsForUser: vi.fn() }));
vi.mock("~/server/entitlements", () => ({ accountCanCreateNamedCrew: vi.fn() }));
vi.mock("~/server/billing_model", () => ({ getBillingForUser: vi.fn() }));

import TeamsPage from "./crews";

function baseLoaderData(overrides: { entitled: boolean; hasBilling: boolean }) {
  return {
    teams: [] as TeamSummary[],
    entitled: overrides.entitled,
    hasBilling: overrides.hasBilling,
  };
}

describe("crews page CTA (CREW-002)", () => {
  beforeEach(() => mockSearchParams.mockReturnValue(new URLSearchParams()));
  afterEach(() => cleanup());

  it("shows the subscribe explainer and hides the create form when not entitled", () => {
    mockLoaderData.mockReturnValue(baseLoaderData({ entitled: false, hasBilling: false }));
    render(<TeamsPage />);

    expect(screen.getByRole("button", { name: "Subscribe to create named crews" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Crew name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage billing" })).not.toBeInTheDocument();
  });

  it("shows the create form plus a Manage billing button when entitled with billing on file", () => {
    mockLoaderData.mockReturnValue(baseLoaderData({ entitled: true, hasBilling: true }));
    render(<TeamsPage />);

    expect(screen.getByPlaceholderText("Crew name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Crew" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage billing" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subscribe to create named crews" })).not.toBeInTheDocument();
  });

  it("shows the create form without Manage billing when entitled but no billing record exists", () => {
    mockLoaderData.mockReturnValue(baseLoaderData({ entitled: true, hasBilling: false }));
    render(<TeamsPage />);

    expect(screen.getByPlaceholderText("Crew name")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage billing" })).not.toBeInTheDocument();
  });

  it('shows "Payment received — your crews are unlocked." when ?checkout=success is present', () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("checkout=success"));
    mockLoaderData.mockReturnValue(baseLoaderData({ entitled: true, hasBilling: true }));
    render(<TeamsPage />);

    expect(screen.getByText("Payment received — your crews are unlocked.")).toBeInTheDocument();
  });

  it("shows no confirmation when the checkout param is absent", () => {
    mockLoaderData.mockReturnValue(baseLoaderData({ entitled: true, hasBilling: true }));
    render(<TeamsPage />);

    expect(screen.queryByText(/Payment received/)).not.toBeInTheDocument();
  });
});
