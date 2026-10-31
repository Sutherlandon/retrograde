// The dashboard's release banner must name the improvements users care most
// about, not just the smaller fixes, and must be written for this release.
import { describe, it, expect } from "vitest";
import pkg from "~/../package.json";
import { RELEASE_ANNOUNCEMENT } from "./release_announcement";

describe("RELEASE_ANNOUNCEMENT", () => {
  const titles = RELEASE_ANNOUNCEMENT.highlights.map((h) => h.title);

  it("names the version being released", () => {
    const [major, minor] = pkg.version.split(".");
    expect(RELEASE_ANNOUNCEMENT.message).toContain(`Retrograde ${major}.${minor}`);
  });

  it("leads with what people will notice on a board", () => {
    expect(titles.slice(0, 3)).toEqual(["Hotkeys", "Action items work like notes", "Notes that stay put"]);
  });

  it.each(["Crew owners run their boards", "More for AI crewmates", "Guest board reminders"])(
    "highlights %s",
    (title) => {
      expect(titles).toContain(title);
    }
  );

  it("gives every highlight a description", () => {
    for (const h of RELEASE_ANNOUNCEMENT.highlights) expect(h.description.length).toBeGreaterThan(0);
  });
});
