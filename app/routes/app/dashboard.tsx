import { Form, useLoaderData, useSearchParams, redirect, type ActionFunctionArgs, useNavigate } from "react-router";
import { requireUser } from "~/hooks/useAuth";
import { pool } from "~/server/db_config";
import { createBoard } from "~/server/board_model";
import { PlusIcon } from "~/images/icons";
import Button from "~/components/Button";
import { ClaimButton } from "~/components/ClaimButton";
import { WelcomeBanner } from "~/components/WelcomeBanner";
import pkg from "~/../package.json";

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
    SELECT b.*, bm.role
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
  const navigate = useNavigate();

  function updateSort(value: string) {
    searchParams.set("sort", value);
    setSearchParams(searchParams);
  }

  return (
    <div className="px-8 mx-auto w-full sm:w-[80%]">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <WelcomeBanner
        id={`${pkg.version}-welcome`}
        title="Welcome to your Retrograde dashboard!"
        message="This is where you can create new boards, view all the boards you have access to, and claim anonymous boards you may have already created.  We've also fixed some bugs and made various improvements."
        link="https://github.com/Sutherlandon/retrograde/releases/tag/v1.2.0"
      />
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-4">
          <div>
            Sort By
          </div>
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
        <div className="flex-grow" />
        <Form method="post">
          <Button
            type="submit"
            text="Create New Board"
            icon={<PlusIcon />}
            variant="solid"
            color="primary"
          />
        </Form>
        <ClaimButton />
      </div>

      <div className="flex justify-end mb-4"></div>

      {boards.length === 0 ? (
        <div className="text-center py-20 border rounded-lg">
          <h2 className="text-xl font-medium mb-4">
            You don't have any boards yet
          </h2>
          <div className="flex items-center justify-center gap-4">
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
            <ClaimButton />
          </div>
        </div>
      ) : (
        <table className="table-auto w-full">
          <thead>
            <tr>
              {["Title", "Role", "Created", "Updated"].map((field) => (
                <th key={field} className="text-left border-b-2 px-4 py-2">
                  {field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {boards.map((board) => (
              <tr
                key={board.id}
                className="hover:bg-gray-200 dark:hover:bg-gray-800 cursor-pointer"
                onClick={() => navigate(`/app/board/${board.id}`)}
              >
                <td className="border-b dark:border-gray-600 px-4 py-4">
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
