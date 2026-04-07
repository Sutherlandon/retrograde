import { useState } from "react";

export const meta = () => [{ title: "Dashboard – Retrograde" }];
import { Form, useLoaderData, useSearchParams, redirect, type ActionFunctionArgs, useNavigate } from "react-router";
import { requireRegisteredUser } from "~/hooks/useAuth";
import { pool } from "~/server/db_config";
import { createBoard, duplicateBoardServer, deleteBoardServer, archiveBoardServer, unarchiveBoardServer } from "~/server/board_model";
import { PlusIcon, CheckIcon, SearchIcon } from "~/images/icons";
import Button from "~/components/Button";
import { WelcomeBanner } from "~/components/WelcomeBanner";
import pkg from "~/../package.json";
import { NewButton } from "~/components/NewButton";
import { ClaimModal } from "~/components/ClaimModal";
import { BoardActionsMenu } from "~/components/BoardActionsMenu";

export async function loader({ request }: { request: Request }) {
  const user = await requireRegisteredUser(request);

  const url = new URL(request.url);
  const sort = url.searchParams.get("sort") ?? "created";

  const orderBy =
    sort === "title"
      ? "b.title ASC"
      : sort === "updated"
        ? "b.updated_at DESC"
        : "b.created_at DESC";

  const boards = await pool.query(
    `
    SELECT b.*, bm.role
    FROM boards b
    JOIN board_members bm ON bm.board_id = b.id
    WHERE bm.user_id = $1 AND b.archived_at IS NULL
    ORDER BY ${orderBy}
    `,
    [user.id]
  );

  const archivedBoards = await pool.query(
    `
    SELECT b.*, bm.role
    FROM boards b
    JOIN board_members bm ON bm.board_id = b.id
    WHERE bm.user_id = $1 AND b.archived_at IS NOT NULL
    ORDER BY b.title ASC
    `,
    [user.id]
  );

  return {
    boards: boards.rows,
    archivedBoards: archivedBoards.rows,
    sort,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireRegisteredUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "duplicate") {
    const boardId = formData.get("boardId")?.toString();
    if (!boardId) throw new Response("Missing boardId", { status: 400 });
    const newBoardId = await duplicateBoardServer(boardId, user.id);
    return redirect(`/app/board/${newBoardId}`);
  }

  if (intent === "delete") {
    const boardId = formData.get("boardId")?.toString();
    if (!boardId) throw new Response("Missing boardId", { status: 400 });
    await deleteBoardServer(boardId, user.id);
    return redirect("/app/dashboard");
  }

  if (intent === "archive") {
    const boardId = formData.get("boardId")?.toString();
    if (!boardId) throw new Response("Missing boardId", { status: 400 });
    await archiveBoardServer(boardId, user.id);
    return null;
  }

  if (intent === "unarchive") {
    const boardId = formData.get("boardId")?.toString();
    if (!boardId) throw new Response("Missing boardId", { status: 400 });
    await unarchiveBoardServer(boardId, user.id);
    return null;
  }

  // Default: create board
  const title = formData.get("title")?.toString().trim() || "Untitled";
  const board_id = await createBoard(title, user.id);
  return redirect(`/app/board/${board_id}`);
}

function fuzzyMatch(text: string, query: string): boolean {
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

export default function AppDashboard() {
  const [claimOpen, setClaimOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const { boards, archivedBoards, sort } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const visibleBoards = filter
    ? boards.filter((b) => fuzzyMatch(b.title, filter))
    : boards;

  function updateSort(value: string) {
    searchParams.set("sort", value);
    setSearchParams(searchParams, { replace: true });
  }

  return (
    <div className="px-8 mx-auto w-full sm:w-[80%]">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <WelcomeBanner
        id={`initial-welcome`}
        title="Welcome to your Retrograde dashboard!"
        message="This is where you can create new boards, view all the boards you have access to, and claim anonymous boards you may have already created. We will also make announcements here anytime we release a new version."
      />
      <WelcomeBanner
        id={`${pkg.version}-release`}
        title={`Version ${pkg.version} Released`}
        message="This release includes several new features the Command Deck for board owners, board attachments, sort by likes, and more. Check out the release notes for all the details!"
        link="https://github.com/Sutherlandon/retrograde/releases"
      />

      {boards.length === 0 ? (
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
              onClick={() => setClaimOpen(true)}
              text="Claim A Board"
              icon={<CheckIcon />}
              variant="solid"
              color="primary"
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <div className="flex items-center gap-4">
              <div className="hidden md:block">
                Sort By
              </div>
              <select
                value={sort}
                onChange={(e) => updateSort(e.target.value)}
                className="border rounded px-2 py-1 border-blue-400 dark:border-blue-800 bg-blue-100 dark:bg-blue-950 cursor-pointer"
              >
                <option value="updated">Recently Updated</option>
                <option value="created">Recently Created</option>
                <option value="title">Title (A–Z)</option>
              </select>
              <div className="relative flex items-center">
                <SearchIcon size="sm" className="absolute left-2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter boards…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="border rounded pl-7 pr-2 py-1 border-blue-400 dark:border-blue-800 bg-blue-100 dark:bg-blue-950"
                />
              </div>
            </div>
            <NewButton
              claimOpen={claimOpen}
              setClaimOpen={setClaimOpen}
            />
          </div>

          <div className="overflow-x-auto border rounded-lg w-full">
            <table className="table-auto w-full">
              <thead>
                <tr>
                  {["Title", "Role", "Created", "Updated"].map((field) => (
                    <th key={field} className="text-left border-b-2 px-4 py-2">
                      {field}
                    </th>
                  ))}
                  <th className="border-b-2 px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {visibleBoards.map((board) => (
                  <tr
                    key={board.id}
                    className="hover:bg-gray-200 dark:hover:bg-gray-800 cursor-pointer"
                    onClick={() => navigate(`/app/board/${board.id}`)}
                  >
                    <td className="border-b dark:border-gray-600 px-4 py-4 min-w-[200px]">
                      <a href={`/app/board/${board.id}`}>
                        {board.title}
                      </a>
                    </td>
                    <td className="border-b dark:border-gray-600 px-4 py-4">
                      {board.role}
                    </td>
                    <td className="border-b dark:border-gray-600 px-4 py-4">
                      {new Date(board.updated_at).toLocaleDateString()}
                    </td>
                    <td className="border-b dark:border-gray-600 px-4 py-4">
                      {new Date(board.created_at).toLocaleDateString()}
                    </td>
                    <td className="border-b dark:border-gray-600 px-4 py-2 text-right">
                      <BoardActionsMenu
                        boardId={board.id}
                        boardTitle={board.title}
                        isOwner={board.role === "owner"}
                        isArchived={false}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {archivedBoards.length > 0 && (
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer mb-3"
              >
                <span>{showArchived ? "▾" : "▸"}</span>
                Archived ({archivedBoards.length})
              </button>

              {showArchived && (
                <div className="overflow-x-auto border rounded-lg w-full opacity-75">
                  <table className="table-auto w-full">
                    <thead>
                      <tr>
                        {["Title", "Role", "Archived"].map((field) => (
                          <th key={field} className="text-left border-b-2 px-4 py-2">
                            {field}
                          </th>
                        ))}
                        <th className="border-b-2 px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {archivedBoards.map((board) => (
                        <tr
                          key={board.id}
                          className="hover:bg-gray-200 dark:hover:bg-gray-800 cursor-pointer"
                          onClick={() => navigate(`/app/board/${board.id}`)}
                        >
                          <td className="border-b dark:border-gray-600 px-4 py-4 min-w-[200px]">
                            <a href={`/app/board/${board.id}`}>
                              {board.title}
                            </a>
                          </td>
                          <td className="border-b dark:border-gray-600 px-4 py-4">
                            {board.role}
                          </td>
                          <td className="border-b dark:border-gray-600 px-4 py-4">
                            {new Date(board.archived_at).toLocaleDateString()}
                          </td>
                          <td className="border-b dark:border-gray-600 px-4 py-2 text-right">
                            <BoardActionsMenu
                              boardId={board.id}
                              boardTitle={board.title}
                              isOwner={board.role === "owner"}
                              isArchived={true}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ClaimModal open={claimOpen} onClose={() => setClaimOpen(false)} />
    </div>
  );
}
