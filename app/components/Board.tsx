import { useBoard } from "./BoardContext";
import BoardToolbar from "./BoardToolbar";
import Column from "./Column";

const noteColors = [
  'bg-yellow-200',
  'bg-green-300',
  'bg-blue-300',
  'bg-red-300',
  'bg-purple-300',
  'bg-pink-300',
];

export default function Board() {
  const { columns, title } = useBoard();

  return (
    <main className="p-4">
      <BoardToolbar title={title} />
      <div className="flex flex-wrap gap-4 text-gray-800">
        {columns.map((col, index) => (
          <Column key={col.id} column={col} noteColor={noteColors[index % noteColors.length]} />
        ))}
      </div>
    </main>
  );
}
