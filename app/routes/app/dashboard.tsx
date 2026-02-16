import { Form, useLoaderData, useSearchParams, redirect, type ActionFunctionArgs } from "react-router";
import { requireUser } from "~/hooks/useAuth";
import { pool } from "~/server/db_config";
import { createBoard } from "~/server/board_model";
import { PlusIcon } from "~/images/icons";
import Button from "~/components/Button";

export async function loader({ request }: { request: Request }) {
  const user = await requireUser(request);

  const url = new URL(request.url);
  const sort = url.searchParams.get("sort") ?? "updated";

  const orderBy =
    sort === "title"
      ? "b.title ASC"
      : sort === "created"
        ? "b.created_at DESC"
        : "b.updated_at DESC";

  const boards = await pool.query(
    `
    SELECT b.*
    FROM boards b
    JOIN board_members bm ON bm.board_id = b.id
    WHERE bm.user_id = $1
    ORDER BY ${orderBy}
    `,
    [user.id]
  );

  return {
    boards: boards.rows,
    sort,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);

  const formData = await request.formData();
  const title = formData.get("title")?.toString().trim() || "Untitled";

  // create the board in the database
  const board_id = await createBoard(title, user.id);

  // redirect to the new board
  return redirect(`/app/board/${board_id}`);
}

export default function AppDashboard() {
  const { boards, sort } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  function updateSort(value: string) {
    searchParams.set("sort", value);
    setSearchParams(searchParams);
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-semibold">Your Boards</h1>

        <Form method="post" className="mb-4">
          <Button
            type="submit"
            text="Create New Board"
            className="px-4 py-2"
            icon={<PlusIcon />}
            variant="outline"
            color="primary"
          />
        </Form>
      </div>

      <div className="flex justify-end mb-4">
        <select
          value={sort}
          onChange={(e) => updateSort(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="updated">Recently Updated</option>
          <option value="created">Recently Created</option>
          <option value="title">Title (A–Z)</option>
        </select>
      </div>

      {boards.length === 0 ? (
        <div className="text-center py-20 border rounded-lg">
          <h2 className="text-xl font-medium mb-4">
            You haven’t created any boards yet.
          </h2>

          <a
            href="/app/boards/new"
            className="bg-black text-white px-4 py-2 rounded-md"
          >
            Create your first board
          </a>
        </div>
      ) : (
        <ul className="grid gap-4">
          {boards.map((board) => (
            <li
              key={board.id}
              className="border rounded-lg p-4 hover:shadow transition"
            >
              <a href={`/app/board/${board.id}`}>
                <div className="text-lg font-medium">
                  {board.title}
                </div>

                <div className="text-sm text-gray-500">
                  Updated {new Date(board.updated_at).toLocaleString()}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
