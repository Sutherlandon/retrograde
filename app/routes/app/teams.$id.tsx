// app/routes/app/teams.$id.tsx
// Team detail (issue #72): crew roster, mission boards, and team objectives.
// Owner manages membership + lifecycle; every member manages objectives.

export const meta = () => [{ title: "Team – Retrograde" }];

import { redirect, useLoaderData, useFetcher, useNavigate, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { requireRegisteredUser } from "~/hooks/useAuth";
import {
  getTeamWithMembers,
  teamRole,
  addTeamMember,
  removeTeamMember,
  renameTeam,
  deleteTeamServer,
  listTeamBoards,
  type TeamBoardRow,
} from "~/server/team_model";
import {
  listTeamActionItems,
  listTeamBoardActionItems,
  createTeamActionItem,
  setTeamActionItemCompleted,
  deleteTeamActionItem,
} from "~/server/action_item_model";
import { createBoard } from "~/server/board_model";
import { findRegisteredUserByUsername } from "~/server/admin_model";
import type { ActionItemDTO, TeamDTO, TeamMemberDTO } from "~/server/board.types";
import { StatusLED } from "~/components/StatusLED";
import { TrashIcon, PlusIcon } from "~/images/icons";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await requireRegisteredUser(request);
  const teamId = params.id;
  if (!teamId) throw new Response("Team ID Missing", { status: 400 });

  const result = await getTeamWithMembers(teamId);
  if (!result) throw new Response("Team Not Found", { status: 404 });

  const role = await teamRole(teamId, user.id);
  if (!role) throw new Response("Forbidden", { status: 403 });

  const [boards, teamItems, boardItems] = await Promise.all([
    listTeamBoards(teamId),
    listTeamActionItems(teamId),
    listTeamBoardActionItems(teamId),
  ]);

  return {
    team: result.team,
    members: result.members,
    boards,
    teamItems,
    boardItems,
    isTeamOwner: role === "owner",
    currentUserId: user.id,
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const user = await requireRegisteredUser(request);
  const teamId = params.id;
  if (!teamId) throw new Response("Team ID Missing", { status: 400 });

  const result = await getTeamWithMembers(teamId);
  if (!result) throw new Response("Team Not Found", { status: 404 });
  const role = await teamRole(teamId, user.id);
  if (!role) throw new Response("Forbidden", { status: 403 });
  const isOwner = role === "owner";

  const form = await request.formData();
  const intent = form.get("intent")?.toString();

  // ----- owner-only lifecycle + membership -----
  if (intent === "rename") {
    if (!isOwner || result.team.is_personal) throw new Response("Forbidden", { status: 403 });
    const name = form.get("name")?.toString().trim();
    if (!name) return { error: "Team name is required." };
    await renameTeam(teamId, name);
    return { success: true };
  }

  if (intent === "deleteTeam") {
    if (!isOwner || result.team.is_personal) throw new Response("Forbidden", { status: 403 });
    await deleteTeamServer(teamId);
    return redirect("/app/teams");
  }

  if (intent === "addMember") {
    if (!isOwner || result.team.is_personal) throw new Response("Forbidden", { status: 403 });
    const username = form.get("username")?.toString().trim();
    if (!username) return { error: "Username is required." };
    const target = await findRegisteredUserByUsername(username);
    if (!target) return { error: `No registered user found with username "${username}".` };
    await addTeamMember(teamId, target.id);
    return { success: true, addedUsername: target.username };
  }

  if (intent === "removeMember") {
    if (!isOwner) throw new Response("Forbidden", { status: 403 });
    const userId = form.get("userId")?.toString();
    if (!userId) return { error: "Missing userId." };
    await removeTeamMember(teamId, userId);
    return { success: true };
  }

  // ----- any member -----
  if (intent === "createBoard") {
    const title = form.get("title")?.toString().trim() || "Untitled";
    const boardId = await createBoard(title, user.id, teamId);
    return redirect(`/app/board/${boardId}`);
  }

  if (intent === "addItem") {
    const text = form.get("text")?.toString().trim();
    if (!text) return { error: "Objective text is required." };
    await createTeamActionItem(teamId, text, user.id);
    return { success: true };
  }

  if (intent === "toggleItem") {
    const itemId = form.get("itemId")?.toString();
    if (!itemId) return { error: "Missing itemId." };
    await setTeamActionItemCompleted(teamId, itemId, form.get("completed") === "true");
    return { success: true };
  }

  if (intent === "deleteItem") {
    const itemId = form.get("itemId")?.toString();
    if (!itemId) return { error: "Missing itemId." };
    await deleteTeamActionItem(teamId, itemId);
    return { success: true };
  }

  throw new Response("Bad Request", { status: 400 });
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-400 dark:text-gray-500 mb-3">
      {children}
    </p>
  );
}

function CrewRoster({ members, isTeamOwner, isPersonal, currentUserId }: {
  members: TeamMemberDTO[]; isTeamOwner: boolean; isPersonal: boolean; currentUserId: string;
}) {
  const addFetcher = useFetcher<{ error?: string; addedUsername?: string }>();
  const removeFetcher = useFetcher();

  return (
    <div className="mb-10">
      <SectionLabel>Crew Roster</SectionLabel>
      <div className="overflow-x-auto border rounded-lg mb-4">
        <table className="table-auto w-full">
          <thead>
            <tr>
              <th className="text-left px-4 py-2 border-b-2">Member</th>
              <th className="text-left px-4 py-2 border-b-2">Role</th>
              <th className="text-left px-4 py-2 border-b-2">Joined</th>
              <th className="border-b-2 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-4 py-3 border-b dark:border-gray-700">
                  <span className="flex items-center gap-2">
                    <StatusLED color={m.role === "owner" ? "amber" : "green"} active size="sm" />
                    {m.username}
                    {m.user_id === currentUserId && (
                      <span className="text-xs text-gray-400">(you)</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 border-b dark:border-gray-700 text-sm">
                  {m.role === "owner" ? (
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                      Commander
                    </span>
                  ) : (
                    "member"
                  )}
                </td>
                <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-500">
                  {new Date(m.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 border-b dark:border-gray-700 text-right">
                  {isTeamOwner && m.role !== "owner" && (
                    <removeFetcher.Form method="post">
                      <input type="hidden" name="intent" value="removeMember" />
                      <input type="hidden" name="userId" value={m.user_id} />
                      <button type="submit" className="text-sm text-red-500 hover:text-red-700 cursor-pointer">
                        Remove
                      </button>
                    </removeFetcher.Form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isTeamOwner && !isPersonal && (
        <addFetcher.Form method="post" className="flex gap-2 items-start flex-wrap">
          <input type="hidden" name="intent" value="addMember" />
          <div className="flex flex-col gap-1">
            <input
              type="text"
              name="username"
              placeholder="Add member by username"
              required
              className="border rounded px-3 py-1.5 border-blue-400 dark:border-blue-800 bg-blue-50 dark:bg-blue-950"
            />
            {addFetcher.data?.error && <p className="text-sm text-red-500">{addFetcher.data.error}</p>}
            {addFetcher.data?.addedUsername && (
              <p className="text-sm text-green-600">Added {addFetcher.data.addedUsername}.</p>
            )}
          </div>
          <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm cursor-pointer">
            Add to Crew
          </button>
        </addFetcher.Form>
      )}
      {isPersonal && (
        <p className="text-xs text-gray-400 dark:text-gray-600">
          Personal teams are just you. Create a named team to invite a crew.
        </p>
      )}
    </div>
  );
}

function MissionBoards({ boards }: { boards: TeamBoardRow[] }) {
  const navigate = useNavigate();
  const createFetcher = useFetcher();

  return (
    <div className="mb-10">
      <SectionLabel>Mission Boards</SectionLabel>
      {boards.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-600 mb-4">No boards yet.</p>
      ) : (
        <div className="overflow-x-auto border rounded-lg mb-4">
          <table className="table-auto w-full">
            <thead>
              <tr>
                <th className="text-left px-4 py-2 border-b-2">Title</th>
                <th className="text-left px-4 py-2 border-b-2">Created</th>
                <th className="text-left px-4 py-2 border-b-2">Open Objectives</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((b) => (
                <tr
                  key={b.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  onClick={() => navigate(`/app/board/${b.id}`)}
                >
                  <td className="px-4 py-3 border-b dark:border-gray-700">
                    <a href={`/app/board/${b.id}`}>{b.title}</a>
                  </td>
                  <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-500">
                    {new Date(b.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 border-b dark:border-gray-700 text-sm">
                    <span className="flex items-center gap-1.5">
                      <StatusLED color="amber" active={b.open_action_items > 0} size="sm" />
                      {b.open_action_items}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <createFetcher.Form method="post" className="flex gap-2 items-start flex-wrap">
        <input type="hidden" name="intent" value="createBoard" />
        <input
          type="text"
          name="title"
          placeholder="New board title"
          className="border rounded px-3 py-1.5 border-blue-400 dark:border-blue-800 bg-blue-50 dark:bg-blue-950"
        />
        <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm cursor-pointer flex items-center gap-1">
          <PlusIcon size="sm" /> New Board
        </button>
      </createFetcher.Form>
    </div>
  );
}

function TeamObjectives({ teamItems, boardItems }: {
  teamItems: ActionItemDTO[];
  boardItems: (ActionItemDTO & { board_title: string })[];
}) {
  const itemFetcher = useFetcher<{ error?: string }>();
  const open = teamItems.filter((i) => !i.completed).length;

  return (
    <div className="mb-10">
      <SectionLabel>Team Objectives</SectionLabel>
      <div className="border rounded-2xl p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700/60 mb-4">
        {teamItems.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-600 mb-2">No team objectives yet.</p>
        ) : (
          <ul className="space-y-1 mb-3">
            {teamItems.map((item) => (
              <li key={item.id} className="flex items-center gap-3 group py-1">
                <itemFetcher.Form method="post" className="flex items-center">
                  <input type="hidden" name="intent" value="toggleItem" />
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="completed" value={String(!item.completed)} />
                  <button
                    type="submit"
                    role="checkbox"
                    aria-checked={item.completed}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer
                      ${item.completed
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-gray-300 dark:border-gray-600 hover:border-green-400"}`}
                  >
                    {item.completed && <span className="text-[10px] leading-none">✓</span>}
                  </button>
                </itemFetcher.Form>
                <span className={`flex-1 text-sm ${item.completed ? "line-through text-gray-400 dark:text-gray-600" : ""}`}>
                  {item.text}
                </span>
                <itemFetcher.Form method="post">
                  <input type="hidden" name="intent" value="deleteItem" />
                  <input type="hidden" name="itemId" value={item.id} />
                  <button
                    type="submit"
                    title="Delete objective"
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity cursor-pointer"
                  >
                    <TrashIcon size="sm" />
                  </button>
                </itemFetcher.Form>
              </li>
            ))}
          </ul>
        )}
        <itemFetcher.Form method="post" className="flex gap-2">
          <input type="hidden" name="intent" value="addItem" />
          <input
            type="text"
            name="text"
            placeholder="Add a team objective…"
            required
            className="flex-1 border rounded px-3 py-1.5 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
          />
          <button type="submit" className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm cursor-pointer">
            Add
          </button>
        </itemFetcher.Form>
      </div>

      {boardItems.length > 0 && (
        <>
          <SectionLabel>Open Board Objectives ({boardItems.length})</SectionLabel>
          <ul className="border rounded-lg divide-y dark:divide-gray-700 border-gray-200 dark:border-gray-700/60">
            {boardItems.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <StatusLED color="amber" active size="sm" />
                <span className="flex-1">{item.text}</span>
                <a
                  href={`/app/board/${item.board_id}`}
                  className="text-xs text-blue-500 hover:underline shrink-0"
                >
                  {item.board_title}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-xs text-gray-400 dark:text-gray-600 mt-2">
        Open {open === 1 ? "objective" : "objectives"}: {open} team-level, {boardItems.length} across boards.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TeamDetailPage() {
  const { team, members, boards, teamItems, boardItems, isTeamOwner, currentUserId } =
    useLoaderData<typeof loader>() as {
      team: TeamDTO; members: TeamMemberDTO[]; boards: TeamBoardRow[];
      teamItems: ActionItemDTO[]; boardItems: (ActionItemDTO & { board_title: string })[];
      isTeamOwner: boolean; currentUserId: string;
    };
  const renameFetcher = useFetcher<{ error?: string }>();
  const deleteFetcher = useFetcher();

  return (
    <div className="px-8 mx-auto w-full sm:w-[80%] max-w-5xl">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-1">
        <h1 className="text-3xl font-semibold flex items-center gap-3">
          {team.name}
          {team.is_personal && (
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
              Personal
            </span>
          )}
        </h1>
        {isTeamOwner && !team.is_personal && (
          <deleteFetcher.Form
            method="post"
            onSubmit={(e) => {
              if (!confirm(`Delete team "${team.name}"? Boards keep existing but leave the team.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="intent" value="deleteTeam" />
            <button type="submit" className="text-sm text-red-500 hover:text-red-700 cursor-pointer">
              Delete Team
            </button>
          </deleteFetcher.Form>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        <a href="/app/teams" className="text-blue-500 hover:underline">← All teams</a>
      </p>

      {isTeamOwner && !team.is_personal && (
        <renameFetcher.Form method="post" className="flex gap-2 items-start flex-wrap mb-8">
          <input type="hidden" name="intent" value="rename" />
          <input
            type="text"
            name="name"
            defaultValue={team.name}
            required
            maxLength={100}
            className="border rounded px-3 py-1.5 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm"
          />
          <button type="submit" className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm hover:border-gray-400 cursor-pointer">
            Rename
          </button>
          {renameFetcher.data?.error && <p className="text-sm text-red-500">{renameFetcher.data.error}</p>}
        </renameFetcher.Form>
      )}

      <CrewRoster members={members} isTeamOwner={isTeamOwner} isPersonal={team.is_personal} currentUserId={currentUserId} />
      <MissionBoards boards={boards} />
      <TeamObjectives teamItems={teamItems} boardItems={boardItems} />
    </div>
  );
}
