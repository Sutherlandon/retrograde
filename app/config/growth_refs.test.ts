// app/config/growth_refs.test.ts
// The refs ride in query strings and are matched exactly by the homepage and
// login routes, so each must be distinct and need no URL encoding.
import { describe, it, expect } from "vitest";
import { CLAIM_REMINDER_REF, INVITE_REF, KEEP_REF } from "./growth_refs";

describe("growth refs", () => {
  it("are distinct, URL-safe values", () => {
    const refs = [INVITE_REF, KEEP_REF, CLAIM_REMINDER_REF];
    expect(new Set(refs).size).toBe(refs.length);
    for (const ref of refs) expect(encodeURIComponent(ref)).toBe(ref);
  });
});
