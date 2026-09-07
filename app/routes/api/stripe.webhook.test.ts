// app/routes/api/stripe.webhook.test.ts
// CREW-002: verifies the write path that flips subscription_status to
// "active" is real — the Stripe webhook is the only place that happens.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConstructEvent = vi.fn();
vi.mock("~/server/stripe_client", () => ({
  stripe: { webhooks: { constructEvent: (...args: unknown[]) => mockConstructEvent(...args) } },
}));

vi.mock("~/server/db_config", () => ({
  stripeWebhookSecret: "whsec_test_secret",
}));

const mockApplySubscriptionState = vi.fn();
vi.mock("~/server/billing_model", () => ({
  applySubscriptionState: (...args: unknown[]) => mockApplySubscriptionState(...args),
}));

import { action, loader } from "./stripe.webhook";

beforeEach(() => {
  vi.clearAllMocks();
  mockApplySubscriptionState.mockResolvedValue(true);
});

function req(body: string, headers: Record<string, string> = {}, method = "POST") {
  return new Request("http://localhost:3000/api/stripe/webhook", {
    method,
    headers,
    body: method === "GET" ? undefined : body,
  });
}

function event(type: string, object: unknown) {
  return { type, data: { object } };
}

describe("CREW-002 POST /api/stripe/webhook [API-007]", () => {
  it("rejects GET with 405 via loader", () => {
    const response = loader() as Response;
    expect(response.status).toBe(405);
  });

  it("rejects a GET action request with 405", async () => {
    const response = (await action({
      request: req("", {}, "GET"),
      params: {}, context: {},
    } as never)) as Response;
    expect(response.status).toBe(405);
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it("returns 400 MISSING_SIGNATURE when the stripe-signature header is absent", async () => {
    const response = (await action({
      request: req("{}"),
      params: {}, context: {},
    } as never)) as Response;
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("MISSING_SIGNATURE");
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_SIGNATURE when constructEvent throws, and never calls applySubscriptionState", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const response = (await action({
      request: req("{}", { "stripe-signature": "sig_bad" }),
      params: {}, context: {},
    } as never)) as Response;
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_SIGNATURE");
    expect(mockApplySubscriptionState).not.toHaveBeenCalled();
  });

  it("passes the exact raw body text to constructEvent", async () => {
    mockConstructEvent.mockReturnValue(event("unrelated.event", {}));
    const rawBody = '{"marker":"raw-body-check-12345"}';
    await action({
      request: req(rawBody, { "stripe-signature": "sig_ok" }),
      params: {}, context: {},
    } as never);
    expect(mockConstructEvent).toHaveBeenCalledWith(rawBody, "sig_ok", "whsec_test_secret");
  });

  it("checkout.session.completed: paid subscription session applies active state", async () => {
    mockConstructEvent.mockReturnValue(
      event("checkout.session.completed", {
        mode: "subscription",
        payment_status: "paid",
        customer: "cus_1",
        subscription: "sub_1",
      }),
    );
    const response = (await action({
      request: req("{}", { "stripe-signature": "sig_ok" }),
      params: {}, context: {},
    } as never)) as Response;
    expect(mockApplySubscriptionState).toHaveBeenCalledWith("cus_1", "sub_1", "active");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it("checkout.session.completed: unpaid session applies nothing but still returns 200", async () => {
    mockConstructEvent.mockReturnValue(
      event("checkout.session.completed", {
        mode: "subscription",
        payment_status: "unpaid",
        customer: "cus_1",
        subscription: "sub_1",
      }),
    );
    const response = (await action({
      request: req("{}", { "stripe-signature": "sig_ok" }),
      params: {}, context: {},
    } as never)) as Response;
    expect(mockApplySubscriptionState).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("checkout.session.async_payment_succeeded: paid subscription applies active state", async () => {
    mockConstructEvent.mockReturnValue(
      event("checkout.session.async_payment_succeeded", {
        mode: "subscription",
        payment_status: "paid",
        customer: "cus_2",
        subscription: "sub_2",
      }),
    );
    await action({
      request: req("{}", { "stripe-signature": "sig_ok" }),
      params: {}, context: {},
    } as never);
    expect(mockApplySubscriptionState).toHaveBeenCalledWith("cus_2", "sub_2", "active");
  });

  it("customer.subscription.updated: applies Stripe's status verbatim", async () => {
    mockConstructEvent.mockReturnValue(
      event("customer.subscription.updated", {
        id: "sub_3",
        customer: "cus_3",
        status: "past_due",
      }),
    );
    await action({
      request: req("{}", { "stripe-signature": "sig_ok" }),
      params: {}, context: {},
    } as never);
    expect(mockApplySubscriptionState).toHaveBeenCalledWith("cus_3", "sub_3", "past_due");
  });

  it("customer.subscription.deleted: applies canceled", async () => {
    mockConstructEvent.mockReturnValue(
      event("customer.subscription.deleted", {
        id: "sub_4",
        customer: "cus_4",
        status: "canceled",
      }),
    );
    await action({
      request: req("{}", { "stripe-signature": "sig_ok" }),
      params: {}, context: {},
    } as never);
    expect(mockApplySubscriptionState).toHaveBeenCalledWith("cus_4", "sub_4", "canceled");
  });

  it("invoice.paid: applies active using parent.subscription_details.subscription", async () => {
    mockConstructEvent.mockReturnValue(
      event("invoice.paid", {
        customer: "cus_5",
        parent: { subscription_details: { subscription: "sub_5" } },
      }),
    );
    await action({
      request: req("{}", { "stripe-signature": "sig_ok" }),
      params: {}, context: {},
    } as never);
    expect(mockApplySubscriptionState).toHaveBeenCalledWith("cus_5", "sub_5", "active");
  });

  it("invoice.payment_failed: applies past_due", async () => {
    mockConstructEvent.mockReturnValue(
      event("invoice.payment_failed", {
        customer: "cus_6",
        parent: { subscription_details: { subscription: "sub_6" } },
      }),
    );
    await action({
      request: req("{}", { "stripe-signature": "sig_ok" }),
      params: {}, context: {},
    } as never);
    expect(mockApplySubscriptionState).toHaveBeenCalledWith("cus_6", "sub_6", "past_due");
  });

  it("an unrelated event type returns 200 and applies nothing", async () => {
    mockConstructEvent.mockReturnValue(event("payment_intent.succeeded", { id: "pi_1" }));
    const response = (await action({
      request: req("{}", { "stripe-signature": "sig_ok" }),
      params: {}, context: {},
    } as never)) as Response;
    expect(response.status).toBe(200);
    expect(mockApplySubscriptionState).not.toHaveBeenCalled();
  });

  it("resolves an expanded customer object ({ id }) to its id string", async () => {
    mockConstructEvent.mockReturnValue(
      event("customer.subscription.updated", {
        id: "sub_7",
        customer: { id: "cus_x" },
        status: "active",
      }),
    );
    await action({
      request: req("{}", { "stripe-signature": "sig_ok" }),
      params: {}, context: {},
    } as never);
    expect(mockApplySubscriptionState).toHaveBeenCalledWith("cus_x", "sub_7", "active");
  });

  it("still returns 200 and warns when applySubscriptionState finds no owning user", async () => {
    mockApplySubscriptionState.mockResolvedValue(false);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockConstructEvent.mockReturnValue(
      event("customer.subscription.updated", {
        id: "sub_8",
        customer: "cus_orphan",
        status: "active",
      }),
    );
    const response = (await action({
      request: req("{}", { "stripe-signature": "sig_ok" }),
      params: {}, context: {},
    } as never)) as Response;
    expect(response.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
