import { useBoard } from "./BoardContext";
import BoardToolbar from "./BoardToolbar";
import Column from "./Column";

const noteColors = [
  'yellow-200',
  'green-300',
  'blue-300',
  'red-300',
  'purple-300',
  'pink-300',
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
