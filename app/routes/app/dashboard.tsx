import { useState, useEffect } from "react";
import { Form, Link, useLoaderData, useSearchParams, useFetcher, redirect, type ActionFunctionArgs, type MetaArgs } from "react-router";
import { requireRegisteredUser } from "~/hooks/useAuth";
import { createBoard, listVisibleBoards } from "~/server/board_model";
import { handleBoardMutation } from "~/server/board_actions";
import { getPersonalTeamForUser, listTeamsForUser, userIsTeamMember } from "~/server/team_model";
import { listOpenActionItemsForUser } from "~/server/action_item_model";
import { PlusIcon, CheckIcon, SearchIcon, ColumnsIcon, ArchiveIcon, CloseIcon } from "~/images/icons";
import Button from "~/components/Button";
import { WelcomeBanner } from "~/components/WelcomeBanner";
import pkg from "~/../package.json";
import { NewButton } from "~/components/NewButton";
import { ClaimModal } from "~/components/ClaimModal";
import { SectionLabel } from "~/components/SectionLabel";
import { DashboardActionItems } from "~/components/DashboardActionItems";
import { SortBoardsBanner } from "~/components/SortBoardsBanner";
import { BulkActionsBar } from "~/components/BulkActionsBar";
import { DashboardBoardsTable, type DashboardBoardRow } from "~/components/DashboardBoardsTable";
import type { TeamSummary } from "~/server/team_model";
import type { UserActionItemRow } from "~/server/action_item_model";

// The dashboard aggregates all boards; a single ?team=unassigned filter remains
// for triaging teamless boards (crews have their own pages now).
export const meta = ({ location }: MetaArgs) => {
  const unassignedOnly = new URLSearchParams(location.search).get("team") === "unassigned";
  return [{ title: unassignedOnly ? "Unassigned Boards – Retrograde" : "Dashboard – Retrograde" }];
};

export async function loader({ request }: { request: Request }) {
  const user = await requireRegisteredUser(request);

  const url = new URL(request.url);
  const sort = url.searchParams.get("sort") ?? "updated";

  const orderBy =
    sort === "title"
      ? "title ASC"
      : sort === "updated"
        ? "updated_at DESC"
        : "created_at DESC";

  const boards = await listVisibleBoards(user.id, { order: orderBy });
  const archivedBoards = await listVisibleBoards(user.id, { archived: true, order: "title ASC" });
  const teams = await listTeamsForUser(user.id);
  const openItems = await listOpenActionItemsForUser(user.id);

  return {
    boards,
    archivedBoards,
    teams,
    openItems,
    sort,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireRegisteredUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  // Board row/bulk mutations are shared with the crew page.
  const boardMutation = await handleBoardMutation(intent, formData, user.id);
  if (boardMutation.handled) return boardMutation.result;

  // Default: create a board. If a real crew is selected in the sidebar/URL
  // (teamId is a crew id, not the "all"/"unassigned" filter values) and the
  // user belongs to it, the board joins that crew. Otherwise it falls back to
  // the personal team (ADR-0003 — authenticated users' boards belong to a team).
  const title = formData.get("title")?.toString().trim() || "Untitled";
  const selectedTeam = formData.get("teamId")?.toString();
  const isRealCrew = selectedTeam && selectedTeam !== "all" && selectedTeam !== "unassigned";

  let teamId: string | null = null;
  if (isRealCrew && await userIsTeamMember(user.id, selectedTeam)) {
    teamId = selectedTeam;
  } else {
    const personalTeam = await getPersonalTeamForUser(user.id);
    teamId = personalTeam?.id ?? null;
  }

  const board_id = await createBoard(title, user.id, teamId);
  return redirect(`/app/board/${board_id}`);
}

export function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    ti = t.indexOf(q[qi], ti);
    if (ti === -1) return false;
    ti++;
  }
  return true;
}

function EmptyBoardsState({ onClaim }: { onClaim: () => void }) {
  return (
    <div className="text-center py-20 border rounded-lg">
      <h2 className="text-xl font-medium mb-4">
        You don't have any boards yet
      </h2>
      <div className="flex items-center justify-center gap-4 flex-col sm:flex-row">
        <Form method="post">
          <Button
            type="submit"
            text="Create New Board"
            icon={<PlusIcon />}
            variant="solid"
            color="primary"
          />
        </Form>
        <div className="mx-2">or</div>
        <Button
          onClick={onClaim}
          text="Claim A Board"
          icon={<CheckIcon />}
          variant="solid"
          color="primary"
        />
      </div>
    </div>
  );
}

function NoUnassignedBoardsState() {
  return (
    <div className="text-center py-20 border rounded-lg">
      <div className="flex justify-center text-green-500 dark:text-green-400 mb-4">
        <CheckIcon size="3xl" />
      </div>
      <h2 className="text-xl font-medium mb-1">
        No unassigned boards
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Every board you can see already belongs to a crew.
      </p>
      <Link to="/dashboard">
        <Button text="Back to Dashboard" variant="solid" color="primary" />
      </Link>
    </div>
  );
}

// Muted, low-emphasis gray button — used for the archive show/hide toggles.
const mutedButton =
  "inline-flex items-center gap-2 px-4 py-2 rounded border border-gray-300 dark:border-gray-700 " +
  "text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 " +
  "hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer";

function BoardsToolbar({ sort, onSort, sortOptions, filter, onFilter, right }: {
  sort: string; onSort: (v: string) => void;
  sortOptions: { value: string; label: string }[];
  filter: string; onFilter: (v: string) => void;
  right: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
      <div className="flex items-center gap-4">
        <div className="hidden md:block">
          Sort By
        </div>
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value)}
          className="border rounded px-2 py-1 border-blue-400 dark:border-blue-800 bg-blue-100 dark:bg-blue-950 cursor-pointer"
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="relative flex items-center">
          <SearchIcon size="sm" className="absolute left-2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter boards…"
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            className="border rounded pl-7 pr-2 py-1 border-blue-400 dark:border-blue-800 bg-blue-100 dark:bg-blue-950"
          />
        </div>
      </div>
      {right}
    </div>
  );
}

function ArchivedBoardsSection({ archivedBoards, teams }: {
  archivedBoards: (DashboardBoardRow & { archived_at: string })[];
  teams: TeamSummary[];
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("archived");

  if (archivedBoards.length === 0) return null;

  // Collapsed: just a muted button that reveals the section.
  if (!showArchived) {
    return (
      <div className="mb-16">
        <button type="button" onClick={() => setShowArchived(true)} className={mutedButton}>
          <ArchiveIcon size="sm" />
          View Archive
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums leading-none bg-gray-200/80 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
            {archivedBoards.length}
          </span>
        </button>
      </div>
    );
  }

  // Client-side sort + filter, mirroring the active board controls.
  const sorted = [...archivedBoards].sort((a, b) => {
    if (sort === "created") return +new Date(b.created_at) - +new Date(a.created_at);
    if (sort === "title") return a.title.localeCompare(b.title);
    return +new Date(b.archived_at) - +new Date(a.archived_at);
  });
  const visible = filter ? sorted.filter((b) => fuzzyMatch(b.title, filter)) : sorted;

  return (
    <div className="mb-16">
      <SectionLabel icon={ArchiveIcon}>Archived</SectionLabel>
      <BoardsToolbar
        sort={sort}
        onSort={setSort}
        sortOptions={[
          { value: "archived", label: "Recently Archived" },
          { value: "created", label: "Recently Created" },
          { value: "title", label: "Title (A–Z)" },
        ]}
        filter={filter}
        onFilter={setFilter}
        right={
          <button type="button" onClick={() => setShowArchived(false)} className={mutedButton}>
            <CloseIcon size="sm" />
            Hide Archive
          </button>
        }
      />
      <DashboardBoardsTable boards={visible} teams={teams} archived />
    </div>
  );
}

export default function AppDashboard() {
  const [claimOpen, setClaimOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { boards, archivedBoards, teams, openItems, sort } = useLoaderData<typeof loader>() as {
    boards: DashboardBoardRow[];
    archivedBoards: (DashboardBoardRow & { archived_at: string })[];
    teams: TeamSummary[];
    openItems: UserActionItemRow[];
    sort: string;
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const bulkFetcher = useFetcher<{ moved?: number; deleted?: number }>();

  // The only remaining board filter is Unassigned (teamless-board triage);
  // crews live on their own pages now.
  const unassignedOnly = searchParams.get("team") === "unassigned";
  const unassignedCount = boards.filter((b) => !b.team_id).length;

  const scopedBoards = unassignedOnly ? boards.filter((b) => !b.team_id) : boards;
  const visibleBoards = filter
    ? scopedBoards.filter((b) => fuzzyMatch(b.title, filter))
    : scopedBoards;

  // Open action items follow the same scope: unassigned = items on teamless boards.
  const visibleItems = unassignedOnly
    ? openItems.filter((item) => (item.team_id ?? item.board_team_id) === null)
    : openItems;

  // Bulk selection completed on the server — clear local selection
  useEffect(() => {
    if (bulkFetcher.data) setSelected(new Set());
  }, [bulkFetcher.data]);

  function showUnassigned() {
    searchParams.set("team", "unassigned");
    setSearchParams(searchParams, { replace: true });
    setSelected(new Set());
  }

  function toggleSelected(boardId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(boardId)) next.delete(boardId);
      else next.add(boardId);
      return next;
    });
  }

  function updateSort(value: string) {
    searchParams.set("sort", value);
    setSearchParams(searchParams, { replace: true });
  }

  return (
    <div className="px-8 mx-auto w-full sm:w-[80%]">
      <h1 className="text-3xl font-semibold mb-1">
        {unassignedOnly ? "Unassigned Boards" : "Dashboard"}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-10">
        {unassignedOnly
          ? "These boards haven't found a crew yet — move them into one whenever you're ready."
          : "Here's everything you're part of: your boards, your crews' boards, and whatever's still open across them. Archived boards are hiding out below if you need them."}
      </p>

      <WelcomeBanner
        id={`initial-welcome`}
        title="Welcome to your Retrograde dashboard!"
        message="This is where you can create new boards, view all the boards you have access to, and claim anonymous boards you may have already created. We will also make announcements here anytime we release a new version."
      />
      <WelcomeBanner
        id={`${pkg.version}-release`}
        title={`Version ${pkg.version} Released`}
        message="This release we've rebuild the voting system - You can now limit votes on a per board, column, or note basis and multiple votes can be cast per note! We've also added board filtering and archiving in the dashboard, board titles now set web page titles, and lots of usability improvements. Check out the release notes for all the details!"
        link="https://github.com/Sutherlandon/retrograde/releases"
      />

      <SortBoardsBanner count={unassignedCount} onSort={showUnassigned} />

      <div className="mb-6">
        <DashboardActionItems items={visibleItems} />
      </div>

      <div className="mb-16">
        <SectionLabel icon={ColumnsIcon}>Boards</SectionLabel>

        {unassignedOnly && scopedBoards.length === 0 ? (
          <NoUnassignedBoardsState />
        ) : boards.length === 0 ? (
          <EmptyBoardsState onClaim={() => setClaimOpen(true)} />
        ) : (
          <>
            <BoardsToolbar
              sort={sort}
              onSort={updateSort}
              sortOptions={[
                { value: "updated", label: "Recently Updated" },
                { value: "created", label: "Recently Created" },
                { value: "title", label: "Title (A–Z)" },
              ]}
              filter={filter}
              onFilter={setFilter}
              right={<NewButton claimOpen={claimOpen} setClaimOpen={setClaimOpen} />}
            />

            <DashboardBoardsTable
              boards={visibleBoards}
              teams={teams}
              selected={selected}
              onToggle={toggleSelected}
              onSelectAll={(ids) => setSelected(new Set(ids))}
            />

            <BulkActionsBar
              count={selected.size}
              teams={teams}
              onMove={(teamId) =>
                bulkFetcher.submit(
                  { intent: "bulkMove", boardIds: [...selected].join(","), teamId },
                  { method: "post" }
                )
              }
              onDelete={() =>
                bulkFetcher.submit(
                  { intent: "bulkDelete", boardIds: [...selected].join(",") },
                  { method: "post" }
                )
              }
              onClear={() => setSelected(new Set())}
            />
          </>
        )}
      </div>

      <ArchivedBoardsSection archivedBoards={archivedBoards} teams={teams} />

      <ClaimModal open={claimOpen} onClose={() => setClaimOpen(false)} />
    </div>
  );
}
