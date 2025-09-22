import React from "react";
import { useBoard } from "./BoardContext";

export default function BoardToolbar({ title }: { title: string }) {
  const { addColumn } = useBoard();

  return (
    <div className="flex justify-center items-center text-gray-100 mb-4 py-4 gap-6">
      <h1 className="text-4xl font-bold">{title}</h1>
      <button
        onClick={() => addColumn()}
        className="text-white bg-blue-600 px-3 py-1 rounded shadow hover:bg-blue-800 cursor-pointer"
      >
        + Column
      </button>
    </div>
  );
}
