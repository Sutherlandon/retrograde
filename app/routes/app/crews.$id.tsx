// app/routes/app/crews.$id.tsx
// Crew detail — the single, refined home for one crew (GitLab-lite): action
// items and boards reuse the dashboard components; members + settings are
// sections on the same page. Board row/bulk mutations are shared with the
// dashboard via handleBoardMutation.

export const meta = () => [{ title: "Crew – Retrograde" }];

import { useState, useEffect, useRef } from "react";
import { redirect, useLoaderData, useFetcher, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { requireRegisteredUser } from "~/hooks/useAuth";
import {
  getTeamWithMembers,
  teamRole,
  addTeamMember,
  removeTeamMember,
  renameTeam,
  deleteTeamServer,
  listTeamsForUser,
  type TeamSummary,
} from "~/server/team_model";
import { createBoard, listVisibleBoards } from "~/server/board_model";
import { handleBoardMutation } from "~/server/board_actions";
import {
  listOpenActionItemsForTeam,
  createTeamActionItem,
  setTeamActionItemCompleted,
  updateTeamActionItemText,
  deleteTeamActionItem,
  type UserActionItemRow,
} from "~/server/action_item_model";
import { listApiKeysForTeam, mintApiKey, revokeApiKey } from "~/server/api_key";
import { findRegisteredUserByUsername } from "~/server/admin_model";
import type { TeamDTO, TeamMemberDTO, DashboardBoardRow, ApiKeyDTO } from "~/server/board.types";
import { StatusLED } from "~/components/StatusLED";
import { DashboardActionItems } from "~/components/DashboardActionItems";
import { DashboardBoardsTable } from "~/components/DashboardBoardsTable";
import { BulkActionsBar } from "~/components/BulkActionsBar";
import { PlusIcon } from "~/images/icons";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await requireRegisteredUser(request);
  const teamId = params.id;
  if (!teamId) throw new Response("Team ID Missing", { status: 400 });

  const result = await getTeamWithMembers(teamId);
  if (!result) throw new Response("Team Not Found", { status: 404 });

  const role = await teamRole(teamId, user.id);
  if (!role) throw new Response("Forbidden", { status: 403 });

  const [boards, openItems, teams, keys] = await Promise.all([
    listVisibleBoards(user.id, { teamId }),
    listOpenActionItemsForTeam(teamId, user.id),
    listTeamsForUser(user.id), // move-to-crew destinations
    listApiKeysForTeam(teamId), // AI crewmates
  ]);

  return {
    team: result.team,
    members: result.members,
    boards,
    openItems,
    teams,
    keys,
    isTeamOwner: role === "owner",
    currentUserId: user.id,
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const user = await requireRegisteredUser(request);
  const teamId = params.id;
  if (!teamId) throw new Response("Team ID Missing", { status: 400 });

  const form = await request.formData();
  const intent = form.get("intent")?.toString();

  // Board row/bulk mutations are shared with the dashboard; ownership is
  // enforced in the model layer, so no crew-membership guard is needed here.
  const boardMutation = await handleBoardMutation(intent, form, user.id);
  if (boardMutation.handled) return boardMutation.result;

  // Crew mutations require membership.
  const result = await getTeamWithMembers(teamId);
  if (!result) throw new Response("Team Not Found", { status: 404 });
  const role = await teamRole(teamId, user.id);
  if (!role) throw new Response("Forbidden", { status: 403 });
  const isOwner = role === "owner";

  // ----- owner-only lifecycle + membership -----
  if (intent === "rename") {
    if (!isOwner || result.team.is_personal) throw new Response("Forbidden", { status: 403 });
    const name = form.get("name")?.toString().trim();
    if (!name) return { error: "Crew name is required." };
    await renameTeam(teamId, name);
    return { success: true };
  }

  if (intent === "deleteTeam") {
    if (!isOwner || result.team.is_personal) throw new Response("Forbidden", { status: 403 });
    await deleteTeamServer(teamId);
    return redirect("/app/crews");
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

  // AI crewmates (API keys). Owner-only like human membership, but permitted on
  // personal crews too — an agent key is how a solo user brings an agent in.
  if (intent === "mintKey") {
    if (!isOwner) throw new Response("Forbidden", { status: 403 });
    const displayName = form.get("display_name")?.toString().trim();
    if (!displayName) return { error: "Display name is required." };
    if (displayName.length > 100) return { error: "Display name is too long (max 100 chars)." };
    const minted = await mintApiKey(teamId, displayName, user.id);
    return { mintedKey: minted.key, mintedDisplayName: minted.apiKey.display_name };
  }

  if (intent === "revokeKey") {
    if (!isOwner) throw new Response("Forbidden", { status: 403 });
    const apiKeyId = form.get("api_key_id")?.toString();
    if (!apiKeyId) return { error: "Missing api_key_id." };
    await revokeApiKey(apiKeyId, teamId);
    return { success: true, revokedId: apiKeyId };
  }

  // ----- any member -----
  if (intent === "createBoard") {
    const title = form.get("title")?.toString().trim() || "Untitled";
    const boardId = await createBoard(title, user.id, teamId);
    return redirect(`/app/board/${boardId}`);
  }

  if (intent === "addItem") {
    const text = form.get("text")?.toString().trim();
    if (!text) return { error: "Action item text is required." };
    await createTeamActionItem(teamId, text, user.id);
    return { success: true };
  }

  if (intent === "toggleItem") {
    const itemId = form.get("itemId")?.toString();
    if (!itemId) return { error: "Missing itemId." };
    await setTeamActionItemCompleted(teamId, itemId, form.get("completed") === "true");
    return { success: true };
  }

  if (intent === "updateItem") {
    const itemId = form.get("itemId")?.toString();
    const text = form.get("text")?.toString().trim();
    if (!itemId) return { error: "Missing itemId." };
    if (!text) return { error: "Action item text is required." };
    await updateTeamActionItemText(teamId, itemId, text);
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
          A personal crew is just you. Create a named crew to invite others.
        </p>
      )}
    </div>
  );
}

function CrewAgents({ keys, isTeamOwner }: { keys: ApiKeyDTO[]; isTeamOwner: boolean }) {
  const mintFetcher = useFetcher<{ mintedKey?: string; mintedDisplayName?: string; error?: string }>();
  const revokeFetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (mintFetcher.data?.mintedKey) formRef.current?.reset();
  }, [mintFetcher.data]);

  return (
    <div className="mb-10">
      <SectionLabel>AI Crew</SectionLabel>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        API keys are AI crewmates. Each key lets an agent act in this crew, and its
        display name is what humans see on the notes it creates. Keys are shown once
        at mint time and stored hashed — see <a href="/llms.txt" className="underline">/llms.txt</a> for the API they authenticate against.
      </p>

      {/* Newly-minted key reveal — shown ONCE */}
      {mintFetcher.data?.mintedKey && (
        <div className="border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/50 rounded-lg p-4 mb-4">
          <h3 className="font-semibold mb-2">New AI crewmate: {mintFetcher.data.mintedDisplayName}</h3>
          <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
            Copy this key now — it will not be shown again. If you lose it, revoke it and mint a new one.
          </p>
          <pre
            data-testid="minted-key"
            className="font-mono text-xs sm:text-sm bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded p-3 overflow-x-auto select-all"
          >
            {mintFetcher.data.mintedKey}
          </pre>
        </div>
      )}

      {keys.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-600 mb-4">
          No AI crewmates yet.{isTeamOwner ? " Mint a key below to bring an agent aboard." : ""}
        </p>
      ) : (
        <div className="overflow-x-auto border rounded-lg mb-4">
          <table className="table-auto w-full">
            <thead>
              <tr>
                <th className="text-left px-4 py-2 border-b-2">Agent</th>
                <th className="text-left px-4 py-2 border-b-2">Key</th>
                <th className="text-left px-4 py-2 border-b-2">Last active</th>
                {isTeamOwner && <th className="border-b-2 px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const isRevoked = !!k.revoked_at;
                return (
                  <tr key={k.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${isRevoked ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 border-b dark:border-gray-700">
                      <span className="flex items-center gap-2">
                        <StatusLED color={isRevoked ? "amber" : "green"} active={!isRevoked} size="sm" />
                        {k.display_name}
                        {isRevoked && <span className="text-xs text-red-500">revoked</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-b dark:border-gray-700 font-mono text-xs">{k.key_prefix}…</td>
                    <td className="px-4 py-3 border-b dark:border-gray-700 text-sm text-gray-500">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "never"}
                    </td>
                    {isTeamOwner && (
                      <td className="px-4 py-3 border-b dark:border-gray-700 text-right">
                        {!isRevoked && (
                          <revokeFetcher.Form method="post">
                            <input type="hidden" name="intent" value="revokeKey" />
                            <input type="hidden" name="api_key_id" value={k.id} />
                            <button type="submit" className="text-sm text-red-500 hover:text-red-700 cursor-pointer">
                              Revoke
                            </button>
                          </revokeFetcher.Form>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isTeamOwner && (
        <mintFetcher.Form ref={formRef} method="post" className="flex gap-2 items-start flex-wrap">
          <input type="hidden" name="intent" value="mintKey" />
          <div className="flex flex-col gap-1 flex-1 min-w-[16rem]">
            <input
              type="text"
              name="display_name"
              placeholder='Agent name (e.g. "Claude (roadmap)")'
              required
              maxLength={100}
              className="border rounded px-3 py-1.5 border-blue-400 dark:border-blue-800 bg-blue-50 dark:bg-blue-950"
            />
            {mintFetcher.data?.error && <p className="text-sm text-red-500">{mintFetcher.data.error}</p>}
          </div>
          <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm cursor-pointer">
            Add AI Crewmate
          </button>
        </mintFetcher.Form>
      )}
    </div>
  );
}

function CrewBoards({ boards, teams }: { boards: DashboardBoardRow[]; teams: TeamSummary[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bulkFetcher = useFetcher<{ moved?: number; deleted?: number }>();
  const createFetcher = useFetcher();

  useEffect(() => {
    if (bulkFetcher.data) setSelected(new Set());
  }, [bulkFetcher.data]);

  function toggleSelected(boardId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(boardId)) next.delete(boardId);
      else next.add(boardId);
      return next;
    });
  }

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
        <SectionLabel>Boards</SectionLabel>
        <createFetcher.Form method="post" className="flex gap-2 items-center -mt-3">
          <input type="hidden" name="intent" value="createBoard" />
          <input
            type="text"
            name="title"
            placeholder="New board title"
            className="border rounded px-3 py-1.5 text-sm border-blue-400 dark:border-blue-800 bg-blue-50 dark:bg-blue-950"
          />
          <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm cursor-pointer flex items-center gap-1">
            <PlusIcon size="sm" /> New Board
          </button>
        </createFetcher.Form>
      </div>

      {boards.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-600">No boards in this crew yet.</p>
      ) : (
        <DashboardBoardsTable
          boards={boards}
          teams={teams}
          selected={selected}
          onToggle={toggleSelected}
          onSelectAll={(ids) => setSelected(new Set(ids))}
          showCrewColumn={false}
        />
      )}

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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CrewDetailPage() {
  const { team, members, boards, openItems, teams, keys, isTeamOwner, currentUserId } =
    useLoaderData<typeof loader>() as {
      team: TeamDTO; members: TeamMemberDTO[]; boards: DashboardBoardRow[];
      openItems: UserActionItemRow[]; teams: TeamSummary[]; keys: ApiKeyDTO[];
      isTeamOwner: boolean; currentUserId: string;
    };
  const renameFetcher = useFetcher<{ error?: string }>();
  const deleteFetcher = useFetcher();
  const addItemFetcher = useFetcher();

  return (
    <div className="px-8 mx-auto w-full sm:w-[80%] max-w-5xl">
      <h1 className="text-3xl font-semibold mb-1">{team.name}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        <a href="/app/crews" className="text-blue-500 hover:underline">← All crews</a>
      </p>

      <DashboardActionItems
        items={openItems}
        defaultExpanded
        scopedTeamId={team.id}
        onAddItem={(text) => addItemFetcher.submit({ intent: "addItem", text }, { method: "post" })}
      />

      <CrewBoards boards={boards} teams={teams} />

      <CrewRoster members={members} isTeamOwner={isTeamOwner} isPersonal={team.is_personal} currentUserId={currentUserId} />

      <CrewAgents keys={keys} isTeamOwner={isTeamOwner} />

      {isTeamOwner && !team.is_personal && (
        <div className="mb-10">
          <SectionLabel>Settings</SectionLabel>
          <renameFetcher.Form method="post" className="flex gap-2 items-start flex-wrap mb-4">
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

          <deleteFetcher.Form
            method="post"
            onSubmit={(e) => {
              if (!confirm(`Delete crew "${team.name}"? Boards keep existing but leave the crew.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="intent" value="deleteTeam" />
            <button type="submit" className="text-sm text-red-500 hover:text-red-700 cursor-pointer">
              Delete Crew
            </button>
          </deleteFetcher.Form>
        </div>
      )}
    </div>
  );
}
