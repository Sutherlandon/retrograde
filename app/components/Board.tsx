import { useState, useEffect, useRef, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  rectIntersection,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useBoard } from "../context/BoardContext";
import BoardToolbar from "./BoardToolbar";
import Column from "./Column";
import TimerEndModal from "./TimerEndModal";

const noteColors = [
  'bg-yellow-200',
  'bg-green-300',
  'bg-blue-300',
  'bg-red-300',
  'bg-purple-300',
  'bg-pink-300',
];

export default function Board() {
  const { columns, title, offline, timeLeft, reorderNote } = useBoard();
  const [showTimerEndModal, setShowTimerEndModal] = useState(false);
  const prevTimeLeft = useRef<number | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [activeNoteData, setActiveNoteData] = useState<{ text: string; color: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
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
      setActiveNoteData(note ? { text: note.text, color: noteColors[colIndex % noteColors.length] } : null);
    }
  }, [columns, findColumnForNote]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    setActiveColumnId(null);
    setActiveNoteData(null);

    if (!over || !activeColumnId) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Determine target column and index
    let toColumnId: string;
    let newIndex: number;

    // Check if dropped over a column droppable
    const overColumn = columns.find((c) => c.id === overId);
    if (overColumn) {
      // Dropped on an empty column or the column itself
      toColumnId = overColumn.id;
      newIndex = overColumn.notes.length;
      // If moving within same column to the end, account for removal
      if (activeColumnId === toColumnId) {
        newIndex = overColumn.notes.filter((n) => n.id !== activeId).length;
      }
    } else {
      // Dropped over another note
      const targetCol = findColumnForNote(overId);
      if (!targetCol) return;
      toColumnId = targetCol.id;
      const overIndex = targetCol.notes.findIndex((n) => n.id === overId);
      if (activeColumnId === toColumnId) {
        // Same column reorder
        const activeIndex = targetCol.notes.findIndex((n) => n.id === activeId);
        newIndex = overIndex;
        if (activeIndex < overIndex) {
          // dragging down — place after the over item
          newIndex = overIndex;
        }
      } else {
        // Cross-column: insert at the over note's position
        newIndex = overIndex;
      }
    }

    if (activeColumnId === toColumnId) {
      const col = columns.find((c) => c.id === toColumnId);
      const currentIndex = col?.notes.findIndex((n) => n.id === activeId);
      if (currentIndex === newIndex) return; // no change
    }

    reorderNote(activeColumnId, toColumnId, activeId, newIndex);
  }, [activeColumnId, columns, findColumnForNote, reorderNote]);

  return (
    <main className="p-4">
      <BoardToolbar title={title} />
      <DndContext
        sensors={sensors}
        collisionDetection={rectIntersection}
        onDragStart={handleDragStart}
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
      <TimerEndModal
        isOpen={showTimerEndModal}
        onClose={() => setShowTimerEndModal(false)}
      />
    </main>
  );
}
