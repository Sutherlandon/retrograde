// app/components/DashboardBoardsTable.tsx
// The dashboard boards table: bulk-selectable rows (owners only), team chips
// with an amber Unassigned state, open action item badges, and the per-row
// actions menu (duplicate / move to team / archive / delete).

import { useNavigate } from "react-router";
import { BoardActionsMenu } from "./BoardActionsMenu";
import type { TeamSummary } from "~/server/team_model";
import type { DashboardBoardRow } from "~/server/board.types";

// Re-exported for existing importers (dashboard, tests).
export type { DashboardBoardRow };

interface DashboardBoardsTableProps {
  boards: DashboardBoardRow[];
  teams: TeamSummary[];
  selected: Set<string>;
  onToggle: (boardId: string) => void;
  onSelectAll: (boardIds: string[]) => void;
  /** Hide the Crew column when the whole table is already scoped to one crew. */
  showCrewColumn?: boolean;
}

export function DashboardBoardsTable({ boards, teams, selected, onToggle, onSelectAll, showCrewColumn = true }: DashboardBoardsTableProps) {
  const navigate = useNavigate();
  const ownedIds = boards.filter((b) => b.role === "owner").map((b) => b.id);
  const allSelected = ownedIds.length > 0 && ownedIds.every((id) => selected.has(id));

  return (
    <div className="border rounded-lg w-full overflow-x-auto">
      <table className="table-auto w-full">
        <thead>
          <tr>
            <th className="border-b-2 px-4 py-2 w-10">
              <input
                type="checkbox"
                aria-label="Select all boards"
                checked={allSelected}
                onChange={() => onSelectAll(allSelected ? [] : ownedIds)}
                className="cursor-pointer accent-blue-600"
              />
            </th>
            {["Title", ...(showCrewColumn ? ["Crew"] : []), "Role", "Action Items", "Created", "Updated"].map((field) => (
              <th key={field} className="text-left border-b-2 px-4 py-2">
                {field}
              </th>
            ))}
            <th className="border-b-2 px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {boards.map((board) => (
            <tr
              key={board.id}
              className={`hover:bg-gray-200 dark:hover:bg-gray-800 cursor-pointer transition-colors
                ${selected.has(board.id) ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}
              onClick={() => navigate(`/app/board/${board.id}`)}
            >
              <td
                className="border-b dark:border-gray-600 px-4 py-4"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${board.title}`}
                  checked={selected.has(board.id)}
                  disabled={board.role !== "owner"}
                  onChange={() => onToggle(board.id)}
                  title={board.role !== "owner" ? "Only board owners can move or delete boards" : undefined}
                  className="cursor-pointer accent-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                />
              </td>
              <td className="border-b dark:border-gray-600 px-4 py-4 min-w-[200px]">
                <a href={`/app/board/${board.id}`}>{board.title}</a>
              </td>
              {showCrewColumn && (
                <td className="border-b dark:border-gray-600 px-4 py-4 text-sm">
                  {board.team_name ? (
                    <span className="text-gray-500 dark:text-gray-400">{board.team_name}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                      Unassigned
                    </span>
                  )}
                </td>
              )}
              <td className="border-b dark:border-gray-600 px-4 py-4">
                {board.role}
              </td>
              <td className="border-b dark:border-gray-600 px-4 py-4">
                {board.open_action_items > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300">
                    {board.open_action_items} open
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-600">—</span>
                )}
              </td>
              <td className="border-b dark:border-gray-600 px-4 py-4">
                {new Date(board.created_at).toLocaleDateString()}
              </td>
              <td className="border-b dark:border-gray-600 px-4 py-4">
                {new Date(board.updated_at).toLocaleDateString()}
              </td>
              <td className="border-b dark:border-gray-600 px-4 py-2 text-right">
                <BoardActionsMenu
                  boardId={board.id}
                  boardTitle={board.title}
                  isOwner={board.role === "owner"}
                  isArchived={false}
                  teams={teams}
                  currentTeamId={board.team_id}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
