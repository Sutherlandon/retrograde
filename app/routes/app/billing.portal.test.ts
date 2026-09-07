// app/routes/app/billing.portal.test.ts
// CREW-002: "Manage billing" hands off to the Stripe-hosted Billing Portal
// (cancel / payment-method changes live there, never built by hand here).

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireRegisteredUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  requireRegisteredUser: (...args: unknown[]) => mockRequireRegisteredUser(...args),
}));

const mockGetBillingForUser = vi.fn();
vi.mock("~/server/billing_model", () => ({
  getBillingForUser: (...args: unknown[]) => mockGetBillingForUser(...args),
}));

const mockPortalSessionsCreate = vi.fn();
vi.mock("~/server/stripe_client", () => ({
  stripe: {
    billingPortal: { sessions: { create: (...args: unknown[]) => mockPortalSessionsCreate(...args) } },
  },
}));

vi.mock("~/server/db_config", () => ({ stripePriceId: "price_test_123" }));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRegisteredUser.mockResolvedValue({ id: "user-1", username: "landon" });
  mockGetBillingForUser.mockResolvedValue({
    userId: "user-1",
    email: "landon@example.com",
    stripeCustomerId: "cus_existing",
    stripeSubscriptionId: "sub_existing",
    subscriptionStatus: "active",
  });
  mockPortalSessionsCreate.mockResolvedValue({ url: "https://billing.stripe.com/session_1" });
});

function postRequest() {
  return new Request("http://localhost:3000/app/billing/portal", { method: "POST" });
}

describe("billing.portal loader (CREW-002) [CREW-021]", () => {
  it("rejects non-POST with 405", async () => {
    const { loader } = await import("./billing.portal");
    const res = loader() as Response;
    expect(res.status).toBe(405);
  });
});

describe("billing.portal action (CREW-002) [CREW-021]", () => {
  it("propagates whatever requireRegisteredUser throws when unauthenticated", async () => {
    const redirectResponse = new Response(null, { status: 302, headers: { Location: "/auth/login" } });
    mockRequireRegisteredUser.mockRejectedValueOnce(redirectResponse);
    const { action } = await import("./billing.portal");

    await expect(
      action({ request: postRequest(), params: {}, context: {} } as never)
    ).rejects.toBe(redirectResponse);
  });

  it("redirects to /app/crews without calling Stripe when the caller has no customer id", async () => {
    mockGetBillingForUser.mockResolvedValueOnce({
      userId: "user-1",
      email: "landon@example.com",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
    });
    const { action } = await import("./billing.portal");
    const res = (await action({ request: postRequest(), params: {}, context: {} } as never)) as Response;

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/app/crews");
    expect(mockPortalSessionsCreate).not.toHaveBeenCalled();
  });

  it("creates a billing portal session and redirects to its url", async () => {
    const { action } = await import("./billing.portal");
    const res = (await action({ request: postRequest(), params: {}, context: {} } as never)) as Response;

    expect(mockPortalSessionsCreate).toHaveBeenCalledWith({
      customer: "cus_existing",
      return_url: "http://localhost:3000/app/crews",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://billing.stripe.com/session_1");
  });
});
