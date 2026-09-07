// app/server/entitlements.test.ts
// CREW-002: the entitlement seam. Backed by Stripe subscription state
// (GAP-005 / ADR-0013) — entitled iff subscription_status is "active".
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));
vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
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
