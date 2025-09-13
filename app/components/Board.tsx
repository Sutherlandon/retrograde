import { useBoard } from "./BoardContext";
import Column from "./Column";

export default function Board() {
  const { columns } = useBoard();

  return (
    <main className="p-4 flex flex-wrap gap-4 text-gray-800">
      {columns.map((col) => (
        <Column key={col.id} column={col} />
      ))}
    </main>
  );
}
