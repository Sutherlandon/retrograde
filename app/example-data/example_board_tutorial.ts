// example-data/example_board_tutorial.ts
// Typed as BoardDTO — no action stubs, no client-only fields.
// readonly: true tells the context to skip all DB calls.

import type { BoardDTO } from "~/server/board.types";

export const exampleBoardTutorial: BoardDTO = {
  id: "example-board",
  title: "Tutorial",
  readonly: true,
  timerRunning: false,
  timerStartedAt: null,
  timerEndsAt: null,
  columns: [
    {
      id: "col-1",
      title: "Welcome!",
      col_order: 0,
      notes: [
        {
          id: "note-1",
          column_id: "col-1",
          text: "Welcome to Retrograde! This is an example board. Your changes won't be saved — refresh to reset.",
          likes: 2,
          is_new: false,
          created: "1760074762199",
        },
        {
          id: "note-2",
          column_id: "col-1",
          text: "Try adding a new note by clicking the + button in the column header.",
          likes: 0,
          is_new: false,
          created: "1760074762200",
        },
        {
          id: "note-3",
          column_id: "col-1",
          text: "Edit notes by double-clicking the text or clicking the pencil icon.",
          likes: 0,
          is_new: false,
          created: "1760074762201",
        },
        {
          id: "note-4",
          column_id: "col-1",
          text: "Like notes with the thumbs-up icon. Try deleting this note with the trash can.",
          likes: 0,
          is_new: false,
          created: "1760074762202",
        },
        {
          id: "note-5",
          column_id: "col-1",
          text: "Now try dragging and dropping notes between columns!",
          likes: 0,
          is_new: false,
          created: "1760074762203",
        },
      ],
    },
    {
      id: "col-2",
      title: "What to try next",
      col_order: 1,
      notes: [
        {
          id: "note-6",
          column_id: "col-2",
          text: "Add a new column with the '+ Column' button at the top right.",
          likes: 0,
          is_new: false,
          created: "1760074762204",
        },
        {
          id: "note-7",
          column_id: "col-2",
          text: "Change a column title by clicking on it.",
          likes: 0,
          is_new: false,
          created: "1760074762205",
        },
        {
          id: "note-8",
          column_id: "col-2",
          text: "Delete this column using the trash can in the column header.",
          likes: 0,
          is_new: false,
          created: "1760074762206",
        },
      ],
    },
    {
      id: "col-3",
      title: "A Few More Things",
      col_order: 2,
      notes: [
        {
          id: "note-9",
          column_id: "col-3",
          text: "Try the timer feature in the header. Start a 3 minute timer, then stop it.",
          likes: 0,
          is_new: false,
          created: "1760074762207",
        },
      ],
    },
  ],
};