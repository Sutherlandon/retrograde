// The dashboard's release banner must name the improvements users care most
// about, not just the smaller fixes.
import { describe, it, expect } from "vitest";
import { RELEASE_ANNOUNCEMENT } from "./release_announcement";

describe("RELEASE_ANNOUNCEMENT", () => {
  const titles = RELEASE_ANNOUNCEMENT.highlights.map((h) => h.title);

  it.each(["Crews", "Board facilitators", "Hide Others' Notes", "Note attribution"])(
    "highlights %s",
    (title) => {
      expect(titles).toContain(title);
    }
  );

  it("leads with those four, in that order", () => {
    expect(titles.slice(0, 4)).toEqual(["Crews", "Board facilitators", "Hide Others' Notes", "Note attribution"]);
  });

  it("gives every highlight a description", () => {
    for (const h of RELEASE_ANNOUNCEMENT.highlights) expect(h.description.length).toBeGreaterThan(0);
  });
});
