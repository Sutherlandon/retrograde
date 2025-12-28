import TimerButton from "./TimerButton";
import Button from "./Button";
import { useBoard } from "./BoardContext";
import { PlusIcon } from "~/images/icons";
import TimerDisplay from "./TimerDisplay";

export default function BoardToolbar({ title }: { title: string }) {
  const { addColumn } = useBoard();

  return (
    <div className="flex justify-between items-center mb-4 py-4 gap-4">
      <h1 style={{ marginBottom: 0 }}>{title}</h1>
      <div className="flex-grow text-center">
        <TimerDisplay />
      </div>
      <TimerButton />
      <Button
        icon={<PlusIcon />}
        text="Column"
        onClick={() => addColumn()}
      />
    </div>
  );
}
