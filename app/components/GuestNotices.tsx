// app/components/GuestNotices.tsx
// The one line under a board for each viewer. Whoever can keep a crewless
// board is told how long it is kept and how to keep it; a guest who joined
// someone else's board, or a signed-out visitor on an example board, is
// invited to start their own. Nobody is shown both.
import { CREATE_FORM_ID } from "~/components/landing/CreateBoardLink";

type GuestFooterKind = "keep" | "claim" | "invite" | null;

export function guestFooterFor({
  isGuest,
  isReadOnly,
  isCreator,
  hasArchiveDate,
  hasOwner,
  isOwner,
}: {
  isGuest: boolean;
  isReadOnly: boolean;
  isCreator: boolean;
  hasArchiveDate: boolean;
  hasOwner: boolean;
  isOwner: boolean;
}): GuestFooterKind {
  if (isReadOnly) return isGuest ? "invite" : null;
  if (isGuest) {
    // Keeping the board is the creator's business, not a participant's.
    if (!isCreator) return "invite";
    return hasArchiveDate ? "keep" : "claim";
  }
  // A signed-in user may be the guest creator after logging in (a new user
  // id), so anyone who can claim an unclaimed board is told, as is its owner.
  if (hasArchiveDate && (!hasOwner || isOwner)) return "keep";
  return null;
}

function loginHref(boardId: string): string {
  return `/auth/login?returnTo=${encodeURIComponent(`/app/board/${boardId}`)}`;
}

// UTC with a fixed locale, so the server render and the browser agree.
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

const FOOTER = "w-full mt-6 text-center text-sm text-gray-500 dark:text-gray-400";
const LINK = "font-semibold text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300";

// "Kept until" is the last day the board is certain to be there: the archive
// job takes it on its first daily run after that moment.
export function KeepNotice({
  archivesAt,
  boardId,
  isGuest,
  isOwner,
}: {
  archivesAt: string;
  boardId: string;
  isGuest: boolean;
  isOwner: boolean;
}) {
  const until = formatDate(archivesAt);
  if (isGuest) {
    return (
      <p className={FOOTER}>
        This guest board is kept until {until}.{" "}
        <a href={loginHref(boardId)} className={LINK}>
          Log in
        </a>{" "}
        and claim it to keep it for good.
      </p>
    );
  }
  return (
    <p className={FOOTER}>
      This board is kept until {until}. {isOwner ? "Move it to a crew" : "Claim it"} to keep it for good.
    </p>
  );
}

// Kept to one short centred line: on an ownerless board the Command Deck is
// open for everyone and floats over the right of the page.
export function StartYourOwnBoard() {
  return (
    <p className={FOOTER}>
      Want Retrograde for your own team?{" "}
      <a href={`/#${CREATE_FORM_ID}`} className={LINK}>
        Start a free board
      </a>
      , no account needed.
    </p>
  );
}

export function ClaimReminder({ boardId }: { boardId: string }) {
  return (
    <p className={FOOTER}>
      You are using this board anonymously.{" "}
      <a href={loginHref(boardId)} className={LINK}>
        Log in
      </a>{" "}
      to claim this board and manage your boards from your dashboard.
    </p>
  );
}

export function GuestFooter({
  boardId,
  archivesAt,
  isGuest,
  isReadOnly,
  isCreator,
  hasOwner,
  isOwner,
}: {
  boardId: string;
  archivesAt: string | null;
  isGuest: boolean;
  isReadOnly: boolean;
  isCreator: boolean;
  hasOwner: boolean;
  isOwner: boolean;
}) {
  const kind = guestFooterFor({ isGuest, isReadOnly, isCreator, hasArchiveDate: Boolean(archivesAt), hasOwner, isOwner });
  if (kind === "keep" && archivesAt) {
    return <KeepNotice archivesAt={archivesAt} boardId={boardId} isGuest={isGuest} isOwner={isOwner} />;
  }
  if (kind === "claim") return <ClaimReminder boardId={boardId} />;
  if (kind === "invite") return <StartYourOwnBoard />;
  return null;
}
