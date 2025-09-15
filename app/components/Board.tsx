import { useBoard } from "./BoardContext";
import BoardToolbar from "./BoardToolbar";
import Column from "./Column";

export default function Board() {
  const { columns, title } = useBoard();

  return (
    <main className="p-4">
      <BoardToolbar title={title} />
      <div className="flex flex-wrap gap-4 text-gray-800">
        {columns.map((col) => (
          <Column key={col.id} column={col} />
        ))}
      </div>
    </main>
  );
}
