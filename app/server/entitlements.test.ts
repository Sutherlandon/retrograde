// app/server/entitlements.test.ts
// CREW-002: the entitlement seam. No billing provider exists yet, so
// accountCanCreateNamedCrew returns true unconditionally today; this test
// documents that and will need to change the moment billing lands.
import { describe, it, expect } from "vitest";
import { accountCanCreateNamedCrew } from "./entitlements";

describe("accountCanCreateNamedCrew (CREW-002)", () => {
  it("returns true for any user today — no billing provider exists yet", async () => {
    await expect(accountCanCreateNamedCrew("user-1")).resolves.toBe(true);
    await expect(accountCanCreateNamedCrew("some-other-user")).resolves.toBe(true);
  });
});
