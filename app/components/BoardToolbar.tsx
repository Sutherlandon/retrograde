import React from "react";
import { useBoard } from "./BoardContext";

export default function BoardToolbar({ title }: { title: string }) {
  const { addColumn } = useBoard();

  return (
    <header className="flex justify-between items-center text-white mb-4">
      <h1 className="text-xl font-bold">{title}</h1>
      <button
        onClick={() => addColumn()}
        className="bg-white text-blue-600 font-semibold px-3 py-1 rounded shadow hover:bg-gray-300 cursor-pointer"
      >
        + Column
      </button>
    </header>
  );
}
