// app/server/entitlements.test.ts
// CREW-002: the entitlement seam. Backed by Stripe subscription state
// (GAP-005 / ADR-0013) — entitled iff subscription_status is "active".
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
let selfHosted = false;
vi.mock("~/server/db_config", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
  get selfHosted() {
    return selfHosted;
  },
}));
vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
  selfHosted = false;
});

describe("accountCanCreateNamedCrew (CREW-002)", () => {
  it("returns true when subscription_status is active", async () => {
    const { accountCanCreateNamedCrew } = await import("./entitlements");
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ subscription_status: "active" }] });
    expect(await accountCanCreateNamedCrew("user-1")).toBe(true);
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["user-1"]);
  });

  it("returns false when subscription_status is past_due", async () => {
    const { accountCanCreateNamedCrew } = await import("./entitlements");
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ subscription_status: "past_due" }] });
    expect(await accountCanCreateNamedCrew("user-1")).toBe(false);
  });

  it("returns false when subscription_status is canceled", async () => {
    const { accountCanCreateNamedCrew } = await import("./entitlements");
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ subscription_status: "canceled" }] });
    expect(await accountCanCreateNamedCrew("user-1")).toBe(false);
  });

  it("returns false when subscription_status is null", async () => {
    const { accountCanCreateNamedCrew } = await import("./entitlements");
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ subscription_status: null }] });
    expect(await accountCanCreateNamedCrew("user-1")).toBe(false);
  });

  it("returns false for an unknown user", async () => {
    const { accountCanCreateNamedCrew } = await import("./entitlements");
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    expect(await accountCanCreateNamedCrew("nonexistent")).toBe(false);
  });
});

describe("crewIsEntitled (CREW-002)", () => {
  it("personal crew: true even when the owner is canceled", async () => {
    const { crewIsEntitled } = await import("./entitlements");
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ is_personal: true, subscription_status: "canceled" }],
    });
    expect(await crewIsEntitled("team-personal")).toBe(true);
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["team-personal"]);
  });

  it("named crew + owner active: true", async () => {
    const { crewIsEntitled } = await import("./entitlements");
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ is_personal: false, subscription_status: "active" }],
    });
    expect(await crewIsEntitled("team-named")).toBe(true);
  });

  it("named crew + owner past_due: false", async () => {
    const { crewIsEntitled } = await import("./entitlements");
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ is_personal: false, subscription_status: "past_due" }],
    });
    expect(await crewIsEntitled("team-named")).toBe(false);
  });

  it("named crew + owner canceled: false", async () => {
    const { crewIsEntitled } = await import("./entitlements");
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ is_personal: false, subscription_status: "canceled" }],
    });
    expect(await crewIsEntitled("team-named")).toBe(false);
  });

  it("named crew + owner null status: false", async () => {
    const { crewIsEntitled } = await import("./entitlements");
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ is_personal: false, subscription_status: null }],
    });
    expect(await crewIsEntitled("team-named")).toBe(false);
  });

  it("missing crew: false", async () => {
    const { crewIsEntitled } = await import("./entitlements");
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    expect(await crewIsEntitled("nonexistent")).toBe(false);
  });

  it("named crew with no owner row: false", async () => {
    const { crewIsEntitled } = await import("./entitlements");
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ is_personal: false, subscription_status: null }],
    });
    expect(await crewIsEntitled("team-orphaned")).toBe(false);
  });
});

// ADR-0016: every account on a self-hosted instance is tier 3. The instance
// is licensed outside Stripe, so billing state is never consulted.
describe("self-hosted instance (ADR-0016)", () => {
  it("CREW-002: lets every account create a named crew without reading billing state", async () => {
    const { accountCanCreateNamedCrew } = await import("./entitlements");
    selfHosted = true;
    expect(await accountCanCreateNamedCrew("user-1")).toBe(true);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it("treats every crew as entitled, so a named crew never freezes for lack of a subscription", async () => {
    const { crewIsEntitled } = await import("./entitlements");
    selfHosted = true;
    expect(await crewIsEntitled("team-1")).toBe(true);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it("still denies an unsubscribed account on the hosted service", async () => {
    const { accountCanCreateNamedCrew } = await import("./entitlements");
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ subscription_status: null }] });
    expect(await accountCanCreateNamedCrew("user-1")).toBe(false);
  });
});
