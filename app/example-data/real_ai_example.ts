import { type BoardDTO } from "~/server/board.types";

export const exampleBoardRealWorld: BoardDTO = {
  id: "example-board-real-world",
  title: "Team Retrospective - Sprint 24",
  readonly: true,
  timerRunning: false,
  timerStartedAt: null,
  timerEndsAt: null,
  columns: [
    {
      id: "col-1",
      title: "What Went Well",
      col_order: 0,
      notes: [
        {
          id: "note-1",
          column_id: "col-1",
          text: "The deployment process went smoothly with zero rollback issues.",
          likes: 3,
          is_new: false,
          created: "1760074763001",
        },
        {
          id: "note-2",
          column_id: "col-1",
          text: "Cross-team communication was much better this sprint thanks to the daily syncs.",
          likes: 4,
          is_new: false,
          created: "1760074763002",
        },
        {
          id: "note-3",
          column_id: "col-1",
          text: "We closed 95% of planned tickets and still had time for code reviews.",
          likes: 2,
          is_new: false,
          created: "1760074763003",
        },
      ],
    },
    {
      id: "col-2",
      title: "What Can Be Improved",
      col_order: 1,
      notes: [
        {
          id: "note-4",
          column_id: "col-2",
          text: "Some tickets lacked clear acceptance criteria, causing rework late in the sprint.",
          likes: 5,
          is_new: false,
          created: "1760074763004",
        },
        {
          id: "note-5",
          column_id: "col-2",
          text: "QA got several stories at the same time near the end of the sprint — need to balance workload earlier.",
          likes: 3,
          is_new: false,
          created: "1760074763005",
        },
      ],
    },
    {
      id: "col-3",
      title: "Action Items",
      col_order: 2,
      notes: [
        {
          id: "note-7",
          column_id: "col-3",
          text: "Add acceptance criteria review to sprint planning checklist.",
          likes: 2,
          is_new: false,
          created: "1760074763007",
        },
        {
          id: "note-8",
          column_id: "col-3",
          text: "Start QA earlier by splitting stories into smaller, testable pieces mid-sprint.",
          likes: 4,
          is_new: false,
          created: "1760074763008",
        },
        {
          id: "note-9",
          column_id: "col-3",
          text: "Rotate daily standup facilitator to help keep meetings concise.",
          likes: 3,
          is_new: false,
          created: "1760074763009",
        },
      ],
    },
  ],
};
