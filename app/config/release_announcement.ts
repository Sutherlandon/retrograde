// app/config/release_announcement.ts
// What the dashboard's release banner says about the current version. The
// banner's id includes the package version, so a new release shows again to
// everyone who dismissed the last one — update this copy when you cut one.

import type { WelcomeMessage } from "~/components/WelcomeBanner";

export const RELEASE_ANNOUNCEMENT: Required<Pick<WelcomeMessage, "message" | "highlights" | "link">> = {
  message: "Retrograde 2.0 is our biggest release yet. Here's what's new:",
  highlights: [
    {
      title: "Crews",
      description:
        "Organize your boards into crews. Everyone gets a personal crew, and named crews bring in teammates and can keep their boards members-only.",
    },
    {
      title: "Board facilitators",
      description:
        "Share the Command Deck without handing over the board. Open Crew Access from the Command Deck to make someone a facilitator by username, or open the deck to everyone in the room.",
    },
    {
      title: "Hide Others' Notes",
      description:
        "Brainstorm without groupthink. While it's on, everyone sees only their own notes. Turn it off to reveal the whole board.",
    },
    {
      title: "Note attribution",
      description:
        "Turn on User Attribution to show who wrote each note. Notes written by AI agents are always labeled.",
    },
    {
      title: "Action items",
      description:
        "Capture follow-ups in their own column on the board, and see every open item across your boards right here on the dashboard.",
    },
    {
      title: "AI crewmates",
      description:
        "Give an agent an API key from your crew page, and it can create boards and add notes alongside your crew.",
    },
    {
      title: "Your existing boards",
      description:
        "Boards from before 2.0 are waiting in Unassigned. Move them into a crew whenever you're ready.",
    },
  ],
  link: "https://github.com/Sutherlandon/retrograde/releases",
};
