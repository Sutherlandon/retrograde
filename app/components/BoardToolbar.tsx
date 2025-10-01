import React from "react";
import { useBoard } from "./BoardContext";
import TimerButton from "./TimerButton";
import Button from "./Button";
import { PlusIcon } from "~/images/icons";

export default function BoardToolbar({ title }: { title: string }) {
  const { addColumn } = useBoard();

  return (
    <div className="flex justify-between items-center text-gray-100 mb-4 py-4 gap-4">
      <h1 className="text-4xl font-bold">{title}</h1>
      <div className="flex-grow" />
      <TimerButton />
      <Button
        icon={<PlusIcon />}
        text="Column"
        onClick={() => addColumn()}
      />
    </div>
  );
}
