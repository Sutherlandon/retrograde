// routes/board.tsx
import { useLoaderData, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { BoardProvider } from "~/components/BoardContext";
import Header from "~/components/Header";
import Board from "~/components/Board";
import {
  getBoardServer,
  addColumnServer,
  updateColumnTitleServer,
  deleteColumnServer,
  addNoteServer,
  updateNoteServer,
  deleteNoteServer,
  moveNoteServer,
} from "../server/board_model";

export async function loader({ params }: LoaderFunctionArgs) {
  const board_id = params.id;

  if (board_id) {
    const board = getBoardServer(board_id);

    if (board_id) {
      if (board) {
        return board;
      } else {
        throw new Response("Board Not Found", { status: 404 });
      }
    }

    throw new Response("Board ID Missing", { status: 400 });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const board_id = params.id;
  if (!board_id) {
    throw new Response("Board ID Missing", { status: 400 });
  }

  const data = await request.formData();

  if (data.has("type") && data.has("payload")) {
    const type = data.get("type") as string;
    const payload = JSON.parse(data.get("payload") as string);

    switch (type) {
      case "addColumn":
        return addColumnServer(board_id, payload.id, payload.title);

      case "updateColumnTitle":
        return updateColumnTitleServer(board_id, payload.id, payload.newTitle);

      case "deleteColumn":
        return deleteColumnServer(board_id, payload.id);

      case "addNote":
        return addNoteServer(payload.id, payload.columnId, payload.text);

      case "updateNote":
        return updateNoteServer(payload.columnId, payload.noteId, payload.newText, payload.likes);

      case "deleteNote":
        return deleteNoteServer(payload.columnId, payload.noteId);

      case "moveNote":
        return moveNoteServer(payload.fromcolumnId, payload.tocolumnId, payload.noteId);

      default:
        throw new Response("Unknown action", { status: 400 });
    }
  }

  // If we reach here, the request was malformed
  throw new Response("Bad Request", { status: 400 });
}

export default function BoardRoute() {
  return (
    <BoardProvider>
      <Header />
      <Board />
    </BoardProvider>
  );
}
