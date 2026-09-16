// app/server/stripe_client.test.ts
// The Stripe SDK must be instantiated exactly once, with the restricted key
// from db_config — never the deprecated global-key pattern. A self-hosted
// instance has no key, and so no client (ADR-0016).
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStripeConstructor = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    constructor(...args: unknown[]) {
      mockStripeConstructor(...args);
    }
  },
}));

let restrictedKey: string | null = "rk_test_abc123";
vi.mock("~/server/db_config", () => ({
  get stripeRestrictedKey() {
    return restrictedKey;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  restrictedKey = "rk_test_abc123";
});

describe("stripe client", () => {
  it("constructs the Stripe SDK with the restricted key exactly once", async () => {
    await import("./stripe_client");
    expect(mockStripeConstructor).toHaveBeenCalledTimes(1);
    expect(mockStripeConstructor).toHaveBeenCalledWith("rk_test_abc123");
  });

  it("constructs no client on a self-hosted instance, where no key is configured (ADR-0016)", async () => {
    restrictedKey = null;
    const { stripe } = await import("./stripe_client");
    expect(mockStripeConstructor).not.toHaveBeenCalled();
    expect(stripe).toBeNull();
  });
});
