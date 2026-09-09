// app/server/billing_model.test.ts
// GAP-005 / ADR-0013: raw parameterized SQL against users.* billing columns.
// applySubscriptionState also revokes named-crew API keys on lapse, inside
// the same transaction as the status write (see billing_model.ts).
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
const mockConnect = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
    connect: (...args: unknown[]) => mockConnect(...args),
  },
}));
vi.mock("~/server/db_init", () => ({}));

const mockRevokeNamedCrewKeysForOwner = vi.fn();
vi.mock("~/server/api_key", () => ({
  revokeNamedCrewKeysForOwner: (...args: unknown[]) => mockRevokeNamedCrewKeysForOwner(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// Builds a fake transaction client whose `query` resolves BEGIN/COMMIT/ROLLBACK
// as no-ops and returns `updateResult` for the UPDATE ... RETURNING id call.
function makeClient(updateResult: { rowCount: number; rows: Array<{ id: string }> }) {
  const query = vi.fn().mockImplementation((sql: string) => {
    if (typeof sql === "string" && sql.includes("UPDATE users")) {
      return Promise.resolve(updateResult);
    }
    return Promise.resolve(undefined); // BEGIN / COMMIT / ROLLBACK
  });
  const release = vi.fn();
  return { query, release };
}

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
  it("active: writes state, returns true, does not revoke", async () => {
    const { applySubscriptionState } = await import("./billing_model");
    const client = makeClient({ rowCount: 1, rows: [{ id: "user-1" }] });
    mockConnect.mockResolvedValueOnce(client);

    const result = await applySubscriptionState("cus_123", "sub_123", "active");

    expect(result).toBe(true);
    const updateCall = client.query.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("UPDATE users")
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0]).toContain("subscription_status");
    expect(updateCall![1]).toEqual(["cus_123", "sub_123", "active"]);
    expect(mockRevokeNamedCrewKeysForOwner).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("canceled: revokes named-crew keys for the matched owner", async () => {
    const { applySubscriptionState } = await import("./billing_model");
    const client = makeClient({ rowCount: 1, rows: [{ id: "user-1" }] });
    mockConnect.mockResolvedValueOnce(client);

    const result = await applySubscriptionState("cus_123", "sub_123", "canceled");

    expect(result).toBe(true);
    expect(mockRevokeNamedCrewKeysForOwner).toHaveBeenCalledWith("user-1", client);
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("past_due: revokes named-crew keys for the matched owner", async () => {
    const { applySubscriptionState } = await import("./billing_model");
    const client = makeClient({ rowCount: 1, rows: [{ id: "user-1" }] });
    mockConnect.mockResolvedValueOnce(client);

    const result = await applySubscriptionState("cus_123", "sub_123", "past_due");

    expect(result).toBe(true);
    expect(mockRevokeNamedCrewKeysForOwner).toHaveBeenCalledWith("user-1", client);
  });

  it("unmatched customer: returns false and revokes nothing", async () => {
    const { applySubscriptionState } = await import("./billing_model");
    const client = makeClient({ rowCount: 0, rows: [] });
    mockConnect.mockResolvedValueOnce(client);

    const result = await applySubscriptionState("cus_missing", null, "canceled");

    expect(result).toBe(false);
    expect(mockRevokeNamedCrewKeysForOwner).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("a throw inside the revocation rolls back the status write", async () => {
    const { applySubscriptionState } = await import("./billing_model");
    const client = makeClient({ rowCount: 1, rows: [{ id: "user-1" }] });
    mockConnect.mockResolvedValueOnce(client);
    mockRevokeNamedCrewKeysForOwner.mockRejectedValueOnce(new Error("boom"));

    await expect(
      applySubscriptionState("cus_123", "sub_123", "canceled")
    ).rejects.toThrow("boom");

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });
});
