// app/server/billing_model.test.ts
// GAP-005 / ADR-0013: raw parameterized SQL against users.* billing columns.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));
vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getBillingForUser", () => {
  it("returns the mapped billing row when the user exists", async () => {
    const { getBillingForUser } = await import("./billing_model");
    mockPoolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: "user-1",
        email: "a@example.com",
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_123",
        subscription_status: "active",
      }],
    });

    const row = await getBillingForUser("user-1");
    expect(row).toEqual({
      userId: "user-1",
      email: "a@example.com",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      subscriptionStatus: "active",
    });
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["user-1"]);
  });

  it("returns null when no such user", async () => {
    const { getBillingForUser } = await import("./billing_model");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect(await getBillingForUser("missing")).toBeNull();
  });
});

describe("setStripeCustomerId", () => {
  it("updates stripe_customer_id for the given user", async () => {
    const { setStripeCustomerId } = await import("./billing_model");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await setStripeCustomerId("user-1", "cus_123");

    const call = mockPoolQuery.mock.calls[0];
    expect(call[0]).toContain("stripe_customer_id");
    expect(call[1]).toEqual(["user-1", "cus_123"]);
  });
});

describe("applySubscriptionState", () => {
  it("returns true and writes subscription state when a user has that customer id", async () => {
    const { applySubscriptionState } = await import("./billing_model");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const result = await applySubscriptionState("cus_123", "sub_123", "active");

    expect(result).toBe(true);
    const call = mockPoolQuery.mock.calls[0];
    expect(call[0]).toContain("subscription_status");
    expect(call[1]).toEqual(["cus_123", "sub_123", "active"]);
  });

  it("returns false when no user has that customer id", async () => {
    const { applySubscriptionState } = await import("./billing_model");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const result = await applySubscriptionState("cus_missing", null, "canceled");

    expect(result).toBe(false);
  });
});
