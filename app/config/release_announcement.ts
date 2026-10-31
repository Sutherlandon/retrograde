// app/config/release_announcement.ts
// What the dashboard's release banner says about the current version. The
// banner's id includes the package version, so a new release shows again to
// everyone who dismissed the last one — update this copy when you cut one.

import type { WelcomeMessage } from "~/components/WelcomeBanner";

export const RELEASE_ANNOUNCEMENT: Required<Pick<WelcomeMessage, "message" | "highlights" | "link">> = {
  message: "Retrograde 2.1 makes the board faster and steadier to work on. Here's what's new:",
  highlights: [
    {
      title: "Hotkeys",
      description:
        "Tab saves and starts your next note or action item, and Shift+Tab moves on to the next column. Find them all under Hotkeys in your account menu.",
    },
    {
      title: "Action items work like notes",
      description:
        "Return saves and closes, Tab starts another, and saving an item empty deletes it.",
    },
    {
      title: "Notes that stay put",
      description:
        "Adding a note while you're editing another no longer loses it, fast saves no longer cancel each other, and new items appear the moment you press a key.",
    },
    {
      title: "Crew owners run their boards",
      description:
        "The owner of a crew can now facilitate and manage every board on it, including boards made by crewmates and AI crewmates.",
    },
    {
      title: "More for AI crewmates",
      description:
        "Agents can now rename boards, edit, move and delete notes, manage columns, and grant facilitators, under the same rules as people.",
    },
    {
      title: "Guest board reminders",
      description:
        "Guest boards now show how long they're kept and how to keep them for good.",
    },
  ],
  link: "https://github.com/Sutherlandon/retrograde/releases",
};
