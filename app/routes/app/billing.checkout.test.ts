// app/routes/app/billing.checkout.test.ts
// CREW-002: the on-ramp to the paid tier. POST-only resource route that
// finds-or-creates the caller's Stripe customer, then redirects to a
// Stripe-hosted Checkout Session. Stripe itself is fully mocked — this test
// only asserts the shape of what we send it and what we do with the result.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireRegisteredUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  requireRegisteredUser: (...args: unknown[]) => mockRequireRegisteredUser(...args),
}));

const mockGetBillingForUser = vi.fn();
const mockSetStripeCustomerId = vi.fn();
vi.mock("~/server/billing_model", () => ({
  getBillingForUser: (...args: unknown[]) => mockGetBillingForUser(...args),
  setStripeCustomerId: (...args: unknown[]) => mockSetStripeCustomerId(...args),
}));

const mockCustomersCreate = vi.fn();
const mockCheckoutSessionsCreate = vi.fn();
vi.mock("~/server/stripe_client", () => ({
  stripe: {
    customers: { create: (...args: unknown[]) => mockCustomersCreate(...args) },
    checkout: { sessions: { create: (...args: unknown[]) => mockCheckoutSessionsCreate(...args) } },
  },
}));

vi.mock("~/server/db_config", () => ({ stripePriceId: "price_test_123" }));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRegisteredUser.mockResolvedValue({ id: "user-1", username: "landon" });
  mockGetBillingForUser.mockResolvedValue({
    userId: "user-1",
    email: "landon@example.com",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
  });
  mockCustomersCreate.mockResolvedValue({ id: "cus_new_1" });
  mockCheckoutSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session_1" });
});

function postRequest() {
  return new Request("http://localhost:3000/app/billing/checkout", { method: "POST" });
}

describe("billing.checkout loader (CREW-002) [CREW-020]", () => {
  it("rejects non-POST with 405", async () => {
    const { loader } = await import("./billing.checkout");
    const res = loader() as Response;
    expect(res.status).toBe(405);
  });
});

describe("billing.checkout action (CREW-002) [CREW-020]", () => {
  it("propagates whatever requireRegisteredUser throws when unauthenticated", async () => {
    const redirectResponse = new Response(null, { status: 302, headers: { Location: "/auth/login" } });
    mockRequireRegisteredUser.mockRejectedValueOnce(redirectResponse);
    const { action } = await import("./billing.checkout");

    await expect(
      action({ request: postRequest(), params: {}, context: {} } as never)
    ).rejects.toBe(redirectResponse);
  });

  it("redirects to /app/crews without calling Stripe when already subscribed", async () => {
    mockGetBillingForUser.mockResolvedValueOnce({
      userId: "user-1",
      email: "landon@example.com",
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: "sub_existing",
      subscriptionStatus: "active",
    });
    const { action } = await import("./billing.checkout");
    const res = (await action({ request: postRequest(), params: {}, context: {} } as never)) as Response;

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/app/crews");
    expect(mockCustomersCreate).not.toHaveBeenCalled();
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("creates a Stripe customer and stores it when the caller has none yet", async () => {
    const { action } = await import("./billing.checkout");
    await action({ request: postRequest(), params: {}, context: {} } as never);

    expect(mockCustomersCreate).toHaveBeenCalledWith({
      email: "landon@example.com",
      metadata: { userId: "user-1" },
    });
    expect(mockSetStripeCustomerId).toHaveBeenCalledWith("user-1", "cus_new_1");
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_new_1" })
    );
  });

  it("does not create a new customer when the caller already has one", async () => {
    mockGetBillingForUser.mockResolvedValueOnce({
      userId: "user-1",
      email: "landon@example.com",
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: null,
      subscriptionStatus: null,
    });
    const { action } = await import("./billing.checkout");
    await action({ request: postRequest(), params: {}, context: {} } as never);

    expect(mockCustomersCreate).not.toHaveBeenCalled();
    expect(mockSetStripeCustomerId).not.toHaveBeenCalled();
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" })
    );
  });

  it("creates the session with the expected shape and no payment_method_types, then redirects to its url", async () => {
    const { action } = await import("./billing.checkout");
    const res = (await action({ request: postRequest(), params: {}, context: {} } as never)) as Response;

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.mode).toBe("subscription");
    expect(params.line_items).toEqual([{ price: "price_test_123", quantity: 1 }]);
    expect(params.success_url).toBe("http://localhost:3000/app/crews?checkout=success");
    expect(params.cancel_url).toBe("http://localhost:3000/app/crews");
    expect(params).not.toHaveProperty("payment_method_types");
    expect(typeof params.integration_identifier).toBe("string");
    expect(params.integration_identifier).toMatch(/^retrograde_[a-z]{8}$/);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://checkout.stripe.com/session_1");
  });

  it("enables Managed Payments so Stripe is merchant of record (ADR-0014)", async () => {
    const { action } = await import("./billing.checkout");
    await action({ request: postRequest(), params: {}, context: {} } as never);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    expect(params.managed_payments).toEqual({ enabled: true });
  });

  it("never sets a param forbidden alongside Managed Payments (would silently disable Stripe as merchant of record)", async () => {
    const { action } = await import("./billing.checkout");
    await action({ request: postRequest(), params: {}, context: {} } as never);

    const params = mockCheckoutSessionsCreate.mock.calls[0][0];
    const forbiddenWithManagedPayments = [
      "adaptive_pricing",
      "automatic_tax",
      "tax_id_collection",
      "payment_method_configuration",
      "payment_method_options",
      "payment_method_types",
      "shipping_address_collection",
      "shipping_options",
      "invoice_creation",
    ];
    for (const key of forbiddenWithManagedPayments) {
      expect(params).not.toHaveProperty(key);
    }

    const forbiddenSubscriptionDataKeys = [
      "default_tax_rates",
      "application_fee_percent",
      "on_behalf_of",
      "transfer_data",
      "invoice_settings",
    ];
    for (const key of forbiddenSubscriptionDataKeys) {
      expect(params.subscription_data ?? {}).not.toHaveProperty(key);
    }

    expect(params.customer_update?.name).toBeUndefined();
    expect(params.customer_update?.address).toBeUndefined();
  });
});
