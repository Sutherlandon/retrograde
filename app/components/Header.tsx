import React from "react";
import { useBoard } from "./BoardContext";

export default function Header() {
  const { addColumn } = useBoard();

  return (
    <header className="flex justify-between items-center bg-blue-600 text-white px-4 py-3">
      <h1 className="text-lg font-bold">Retro Board</h1>
      <button
        onClick={addColumn}
        className="bg-white text-blue-600 font-semibold px-3 py-1 rounded shadow hover:bg-gray-300 cursor-pointer"
      >
        + Column
      </button>
    </header>
  );
}
