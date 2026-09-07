// app/server/stripe_client.test.ts
// The Stripe SDK must be instantiated exactly once, with the restricted key
// from db_config — never the deprecated global-key pattern.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStripeConstructor = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    constructor(...args: unknown[]) {
      mockStripeConstructor(...args);
    }
  },
}));

vi.mock("~/server/db_config", () => ({
  stripeRestrictedKey: "rk_test_abc123",
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("stripe client", () => {
  it("constructs the Stripe SDK with the restricted key exactly once", async () => {
    await import("./stripe_client");
    expect(mockStripeConstructor).toHaveBeenCalledTimes(1);
    expect(mockStripeConstructor).toHaveBeenCalledWith("rk_test_abc123");
  });
});
