import { Form, redirect, useActionData, type ActionFunctionArgs } from "react-router";
import { nanoid } from "nanoid";

import Header from "~/components/Header";
import { createBoard } from "~/server/board_model";

export async function action({ request }: ActionFunctionArgs) {
  const data = await request.formData();
  const title = data.get("title")?.toString().trim();
  const no_jerks = data.get("no_jerks");

  const errors: Record<string, string> = {};

  // validate the form data
  if (!title || title.length < 3) {
    errors.title = "Title must be at least 3 characters.";
  }

  // check if they agreed to the kindness checkbox
  if (!no_jerks) {
    errors.no_jerks = "You must agree to the kindness checkbox.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors, status: 400 };
  }

  // generate a unique board ID
  const board_id = nanoid();

  // create the board in the database
  await createBoard(board_id, title!);

  // redirect to the new board
  return redirect(`/board/${board_id}`);
}

export default function Home() {
  const actionData = useActionData<{ errors?: Record<string, string> }>();

  return (
    <>
      <Header />
      <div className="p-10 bg-slate-800 rounded shadow-md max-w-md mx-auto mt-10 text-gray-100 text-center">
        <h1 className="text-2xl font-bold mb-4">Create a New Board</h1>
        <Form method="post" className="mb-4">
          <div className="mb-4">
            <label htmlFor='title' className="text-lg font-bold text-left block">Title</label>
            <input type='text' id='title' name='title' placeholder="Board Title" className="p-2 w-full border rounded" />
            {actionData?.errors?.title && (
              <p className="text-red-500 text-sm mt-1 text-left">
                {actionData.errors.title}
              </p>
            )}
          </div>
          <div className="mb-4 text-left">
            <input type="checkbox" id="no_jerks" name="no_jerks" className="mr-2" />
            <label htmlFor="no_jerks">I will treat other's the way I want to be treated.</label>
            {actionData?.errors?.no_jerks && (
              <p className="text-red-500 text-sm mt-1 text-left">
                {actionData.errors.no_jerks}
              </p>
            )}
          </div>
          <div className="mb-4">
            <button
              type="submit"
              name="type"
              value="addColumn"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-800 hover:cursor-pointer"
            >
              Create Board <span className="pl-2">🚀</span>
            </button>
          </div>
        </Form>
      </div>
    </>
  );
}
