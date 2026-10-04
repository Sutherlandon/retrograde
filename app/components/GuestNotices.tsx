// app/components/GuestNotices.tsx
// What a guest is told on a board: when a crewless board will be archived,
// and, for anyone who did not start it, how to run their own team's retro.
import { CREATE_FORM_ID } from "~/components/landing/CreateBoardLink";

type GuestFooter = "invite" | "claim" | null;

// Which line closes the board for this viewer. Signed-in users get neither:
// they have a dashboard. The guest who started the board is reminded to claim
// it unless the archive notice already says so; everyone else is invited.
export function guestFooterFor({
  isGuest,
  isReadOnly,
  isCreator,
  hasArchiveNotice,
}: {
  isGuest: boolean;
  isReadOnly: boolean;
  isCreator: boolean;
  hasArchiveNotice: boolean;
}): GuestFooter {
  if (!isGuest) return null;
  if (isReadOnly || !isCreator) return "invite";
  return hasArchiveNotice ? null : "claim";
}

function loginHref(boardId: string): string {
  return `/auth/login?returnTo=${encodeURIComponent(`/app/board/${boardId}`)}`;
}

// UTC with a fixed locale, so the server render and the browser agree.
function formatArchiveDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

export function ArchiveNotice({
  archivesAt,
  boardId,
  isGuest,
  hasOwner,
  isOwner,
}: {
  archivesAt: string;
  boardId: string;
  isGuest: boolean;
  hasOwner: boolean;
  isOwner: boolean;
}) {
  let action: React.ReactNode = null;
  if (isGuest) {
    action = (
      <>
        {" "}
        <a href={loginHref(boardId)} className="font-semibold underline hover:text-amber-700 dark:hover:text-amber-100">
          Log in
        </a>{" "}
        and claim it to keep it.
      </>
    );
  } else if (!hasOwner) {
    action = " Claim it to keep it.";
  } else if (isOwner) {
    action = " Move it to a crew to keep it.";
  }

  return (
    <p
      role="status"
      className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-center text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      This board will be archived after {formatArchiveDate(archivesAt)}.{action}
    </p>
  );
}

// Kept to one short centred line: on an ownerless board the Command Deck is
// open for everyone and floats over the right of the page.
export function StartYourOwnBoard() {
  return (
    <p className="w-full mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
      Want Retrograde for your own team?{" "}
      <a href={`/#${CREATE_FORM_ID}`} className="font-semibold text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
        Start a free board
      </a>
      , no account needed.
    </p>
  );
}

export function ClaimReminder({ boardId }: { boardId: string }) {
  return (
    <p className="w-full mt-6 text-center text-sm text-gray-400 dark:text-gray-500">
      You are using this board anonymously.{" "}
      <a href={loginHref(boardId)} className="underline hover:text-gray-600 dark:hover:text-gray-300">
        Log in
      </a>{" "}
      to claim this board and manage your boards from your dashboard.
    </p>
  );
}
