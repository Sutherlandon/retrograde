// routes/board.tsx
import { Routes, Route, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { BoardProvider } from "../components/BoardContext";
import Header from "../components/Header";
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
} from "../server/boardStore";

export async function loader(_: LoaderFunctionArgs) {
  return getBoardServer();
}

export async function action({ request }: ActionFunctionArgs) {
  const data = await request.formData();

  if (data.has("type") && data.has("payload")) {
    const type = data.get("type") as string;
    const payload = JSON.parse(data.get("payload") as string);

    switch (type) {
      case "addColumn":
        return addColumnServer(payload.id, payload.title);

      case "updateColumnTitle":
        updateColumnTitleServer(payload.id, payload.newTitle);
        return { ok: true };

      case "deleteColumn":
        deleteColumnServer(payload.id);
        return { ok: true };

      case "addNote":
        return addNoteServer(payload.id, payload.columnId, payload.text);

      case "updateNote":
        updateNoteServer(payload.colId, payload.noteId, payload.newText, payload.likes);
        return { ok: true };

      case "deleteNote":
        deleteNoteServer(payload.colId, payload.noteId);
        return { ok: true };

      case "moveNote":
        moveNoteServer(payload.fromColId, payload.toColId, payload.noteId);
        return { ok: true };

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
      <Routes>
        <Route path="/board" element={<Board />} />
      </Routes>
    </BoardProvider>
  );
}
