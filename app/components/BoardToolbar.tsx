import { useState, useEffect, useRef } from "react";
import { useFetcher, useLocation, useRevalidator, Link } from "react-router";
import { useBoard } from "~/context/BoardContext";
import { useOptionalUser } from "~/context/userContext";
import { FlagIcon } from "~/images/icons";
import TimerDisplay from "./TimerDisplay";
import { BoardStatusBar } from "./BoardStatusBar";

// BRD-020: how long the post-claim confirmation stays up before it
// auto-dismisses.
const CLAIM_CONFIRMATION_MS = 6000;

/**
 * BRD-020: the primary claim affordance — a small, unobtrusive control on
 * the board itself, shown only when the board has no owner (GAP-002). A
 * registered user claims directly; an anonymous one is sent to log in first.
 */
function ClaimBoardControl() {
  const { hasOwner } = useBoard();
  const user = useOptionalUser();
  const location = useLocation();
  const revalidator = useRevalidator();
  const fetcher = useFetcher<{ error?: string; success?: boolean }>();
  const [justClaimed, setJustClaimed] = useState(false);

  useEffect(() => {
    // Once the claim lands, revalidate so the loader's hasOwner/isOwner
    // catches up on the next render instead of waiting on the 3s poll,
    // which doesn't touch these fields. Note the success state locally too —
    // hasOwner flips true on revalidation, but the confirmation must still
    // render (it renders even when hasOwner is true, below).
    if (fetcher.data?.success) {
      setJustClaimed(true);
      revalidator.revalidate();
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (!justClaimed) return;
    const timer = setTimeout(() => setJustClaimed(false), CLAIM_CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [justClaimed]);

  const badgeClass =
    "shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300";

  if (justClaimed) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300">
        <FlagIcon size="xs" />
        You have planted your flag. The board now belongs to you.
      </span>
    );
  }

  if (hasOwner) return null;

  if (!user || user.is_anonymous) {
    return (
      <Link to={`/auth/login?returnTo=${encodeURIComponent(location.pathname)}`} className={badgeClass}>
        <FlagIcon size="xs" />
        Log in to claim this board
      </Link>
    );
  }

  const claim = () => {
    fetcher.submit(
      { boardLink: window.location.href },
      { method: "POST", action: "/app/board/claim" }
    );
  };

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={claim}
        disabled={fetcher.state !== "idle"}
        className={`${badgeClass} cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800 disabled:opacity-60`}
      >
        <FlagIcon size="xs" />
        {fetcher.state !== "idle" ? "Claiming…" : "Claim this board"}
      </button>
      {fetcher.data?.error && (
        <span className="text-xs text-red-500 dark:text-red-400">{fetcher.data.error}</span>
      )}
    </span>
  );
}

export default function BoardToolbar({ title }: { title: string }) {
  const { updateTitle, canFacilitate, boardLocked, teamName } = useBoard();
  const [editing, setEditing] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setLocalTitle(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const save = () => {
    const trimmed = localTitle.trim() || "Untitled";
    setLocalTitle(trimmed);
    updateTitle(trimmed);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") {
      setLocalTitle(title);
      setEditing(false);
    }
  };

  const canEdit = canFacilitate && !boardLocked;

  return (
    <div className="flex items-baseline py-4 gap-2 sm:gap-4">
      <div className="min-w-0 flex-shrink flex items-baseline gap-2">
        {editing ? (
          <input
            ref={inputRef}
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={save}
            onKeyDown={handleKeyDown}
            className="text-xl sm:text-2xl md:text-4xl font-bold border rounded w-full p-2"
          />
        ) : (
          <h1
            onClick={() => { if (canEdit) setEditing(true); }}
            className={`text-xl sm:text-2xl md:text-4xl font-bold truncate p-2 border border-transparent rounded-md ${canEdit ? "cursor-text hover:bg-slate-200 dark:hover:bg-slate-950" : ""}`}
            title={!canEdit ? (boardLocked ? "Board is locked" : "Only facilitators can edit the title") : "Click to edit title"}
          >
            {localTitle}
          </h1>
        )}
        {teamName && !editing && (
          <span
            data-testid="board-crew-tag"
            className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300"
          >
            {teamName}
          </span>
        )}
        {!editing && <ClaimBoardControl />}
      </div>
      <div className="flex-grow text-center">
        <TimerDisplay />
      </div>
      <div className="flex-shrink-0">
        <BoardStatusBar />
      </div>
    </div>
  );
}
