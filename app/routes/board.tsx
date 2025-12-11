// routes/board.tsx
import { type ActionFunctionArgs, type ClientLoaderFunctionArgs, type LoaderFunctionArgs } from "react-router";
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
import { exampleBoardTutorial } from "~/example-data/example_board_tutorial";
import { exampleBoardRealWorld } from "~/example-data/real_ai_example";

let force_fail = false; // for testing offline mode

export async function loader({ params }: LoaderFunctionArgs) {
  const board_id = params.id;

  if (force_fail) {
    const err = new Error('Failed to fetch');
    throw err;
  } else {
    console.log("Next load will fail to fetch for testing offline mode");
    // force_fail = true;
  }

  if (board_id === "example-board") {
    return exampleBoardTutorial;
  }
  if (board_id === "example-board-real-world") {
    return exampleBoardRealWorld;
  }

  if (board_id) {
    try {
      const board = await getBoardServer(board_id);
      if (board) {
        // Calculate next_col_order for client use
        board.next_col_order = (board.columns.length > 0)
          ? Math.max(...board.columns.map(c => c.col_order)) + 1
          : 1

        return board;
      } else {
        throw new Response("Board Not Found", { status: 404 });
      }
    } catch (error) {
      console.error("Error2 loading board:", error);
    }
  }

  throw new Response("Board ID Missing", { status: 400 });
}

export async function clientLoader({ serverLoader }: ClientLoaderFunctionArgs) {
  try {
    const serverData = await serverLoader();
    console.log({ serverData });
    return serverData;
  } catch (error) {
    console.log("Client loader caught error:");
    console.error(error);
    throw error;
  }
}

clientLoader.hydrate = true as const;

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
        return addColumnServer(board_id, payload.id, payload.title, payload.col_order);

      case "updateColumnTitle":
        return updateColumnTitleServer(board_id, payload.id, payload.newTitle);

      case "deleteColumn":
        return deleteColumnServer(board_id, payload.id);

      case "addNote":
        return addNoteServer(payload.id, payload.columnId, payload.text, payload.created);

      case "updateNote":
        return updateNoteServer(payload.columnId, payload.noteId, payload.newText, payload.likes, payload.created);

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
