import { useState, useEffect, useRef, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  rectIntersection,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useBoard } from "../context/BoardContext";
import BoardToolbar from "./BoardToolbar";
import Column from "./Column";
import TimerEndModal from "./TimerEndModal";
import { AttachmentsList } from "./AttachmentsList";

const noteColors = [
  'bg-yellow-200',
  'bg-green-300',
  'bg-blue-300',
  'bg-red-300',
  'bg-purple-300',
  'bg-pink-300',
];

export default function Board() {
  const { columns, title, offline, timeLeft, reorderNote, moveNoteLocally } = useBoard();
  const [showTimerEndModal, setShowTimerEndModal] = useState(false);
  const prevTimeLeft = useRef<number | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const originColumnId = useRef<string | null>(null);
  const [activeNoteData, setActiveNoteData] = useState<{ text: string; color: string } | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    if (prevTimeLeft.current !== null && prevTimeLeft.current > 0 && timeLeft === 0) {
      setShowTimerEndModal(true);
    }

    prevTimeLeft.current = timeLeft;
  }, [timeLeft]);

  // Find which column a note belongs to
  const findColumnForNote = useCallback((noteId: string) => {
    return columns.find((col) => col.notes.some((n) => n.id === noteId));
  }, [columns]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const col = findColumnForNote(active.id as string);
    if (col) {
      const note = col.notes.find((n) => n.id === active.id);
      const colIndex = columns.findIndex((c) => c.id === col.id);
      setActiveDragId(active.id as string);
      setActiveColumnId(col.id);
      originColumnId.current = col.id;
      setActiveNoteData(note ? { text: note.text, color: noteColors[colIndex % noteColors.length] } : null);
    }
  }, [columns, findColumnForNote]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !activeDragId) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find current column of the dragged note
    const fromCol = findColumnForNote(activeId);
    if (!fromCol) return;

    // Determine target column: either directly over a column, or over a note in a column
    const overColumn = columns.find((c) => c.id === overId);
    const overNoteCol = overColumn ? null : findColumnForNote(overId);
    const toCol = overColumn || overNoteCol;
    if (!toCol || toCol.id === fromCol.id) return;

    // Determine insertion index
    let newIndex: number;
    if (overColumn) {
      // Hovering over the column itself (empty area) — append to end
      newIndex = overColumn.notes.length;
    } else {
      // Hovering over a specific note — insert at that position
      newIndex = toCol.notes.findIndex((n) => n.id === overId);
      if (newIndex < 0) newIndex = toCol.notes.length;
    }

    // Move the note locally (no server call) so the SortableContext updates
    moveNoteLocally(fromCol.id, toCol.id, activeId, newIndex);
    setActiveColumnId(toCol.id);
  }, [activeDragId, columns, findColumnForNote, moveNoteLocally]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    const fromColumnId = originColumnId.current;
    setActiveDragId(null);
    setActiveColumnId(null);
    originColumnId.current = null;
    setActiveNoteData(null);

    if (!over || !fromColumnId) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find which column the note is currently in (may have been moved by onDragOver)
    const currentCol = findColumnForNote(activeId);
    if (!currentCol) return;

    const toColumnId = currentCol.id;

    if (fromColumnId === toColumnId) {
      // Same-column reorder: determine the target index from what we're over
      let newIndex: number;

      const overColumn = columns.find((c) => c.id === overId);
      if (overColumn) {
        newIndex = overColumn.notes.filter((n) => n.id !== activeId).length;
      } else {
        const overIndex = currentCol.notes.findIndex((n) => n.id === overId);
        const activeIndex = currentCol.notes.findIndex((n) => n.id === activeId);
        newIndex = overIndex;
        if (activeIndex < overIndex) {
          newIndex = overIndex;
        }
      }

      const currentIndex = currentCol.notes.findIndex((n) => n.id === activeId);
      if (currentIndex === newIndex) return; // no change

      reorderNote(fromColumnId, toColumnId, activeId, newIndex);
    } else {
      // Cross-column: note is already in the right position from onDragOver.
      // Persist the current order of the target column to the server.
      const noteIndex = currentCol.notes.findIndex((n) => n.id === activeId);
      reorderNote(toColumnId, toColumnId, activeId, noteIndex);
    }
  }, [columns, findColumnForNote, reorderNote]);

  return (
    <main className="p-4">
      <BoardToolbar title={title} />
      <DndContext
        sensors={sensors}
        collisionDetection={rectIntersection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-wrap gap-4">
          {offline && (
            <div className="w-full p-2 mb-4 text-center bg-red-500 dark:bg-red-700 text-white rounded">
              You are currently offline. Changes you make will be lost when you reconnect. Reconnecting...
            </div>
          )}
          {columns.map((col, index) => (
            <Column key={col.id} column={col} noteColor={noteColors[index % noteColors.length]} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDragId && activeNoteData ? (
            <div className={`${activeNoteData.color} text-slate-900 rounded-md p-2 shadow-lg text-xs w-[140px] min-h-[6rem] rotate-3 cursor-grabbing`}>
              <div className="whitespace-pre-wrap">{activeNoteData.text}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <AttachmentsList />
      <TimerEndModal
        isOpen={showTimerEndModal}
        onClose={() => setShowTimerEndModal(false)}
      />
    </main>
  );
}
