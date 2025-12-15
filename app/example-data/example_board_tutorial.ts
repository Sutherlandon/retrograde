import { type Board } from "~/server/board.types";

export const exampleBoardTutorial: Board = {
  id: "example-board",
  title: "Tutorial",
  next_col_order: 2,
  columns: [
    {
      id: 'col-1',
      title: 'Welcome!',
      col_order: 0,
      notes: [
        {
          id: 'note-1',
          column_id: 'col-1',
          text: 'Welcome to Retrograde! This is an example board to help you get started. Feel free to explore and modify it as you like. Your changes will not be saved and refreshing the page will reset the board to its original state.',
          likes: 2,
          is_new: false,
          created: '1760074762199'
        },
        {
          id: 'note-2',
          column_id: 'col-1',
          text: 'Try adding a new note by clicking the + button in the column header, and filling it out.',
          likes: 0,
          is_new: false,
          created: '1760074762200'
        },
        {
          id: 'note-3',
          column_id: 'col-1',
          text: 'You can edit notes by double-clicking the text or clicking the pencil icon.',
          likes: 0,
          is_new: false,
          created: '1760074762201'
        },
        {
          id: 'note-4',
          column_id: 'col-1',
          text: 'You can like notes by clicking the thumbs-up icon.  Now try deleting this note by clicking the trash can icon.',
          likes: 0,
          is_new: false,
          created: '1760074762202'
        },
        {
          id: 'note-5',
          column_id: 'col-1',
          text: 'Now try dragging and dropping notes between columns!',
          likes: 0,
          is_new: false,
          created: '1760074762203'
        },
      ]
    },
    {
      id: 'col-2',
      title: 'What to try next',
      col_order: 0,
      notes: [
        {
          id: 'note-6',
          column_id: 'col-2',
          text: 'Next, try adding a new column by clicking the "+ Column" button at the top right corner of the board.',
          likes: 0,
          is_new: false,
          created: '1760074762204'
        },
        {
          id: 'note-7',
          column_id: 'col-2',
          text: 'You can change the title of any column by clicking on it.',
          likes: 0,
          is_new: false,
          created: '1760074762205'
        },
        {
          id: 'note-8',
          column_id: 'col-2',
          text: 'Now try deleting this column by clicking the trash can icon in the column header.',
          likes: 0,
          is_new: false,
          created: '1760074762206'
        },
      ]
    },
    {
      id: 'col-3',
      title: 'A Few More Things',
      col_order: 0,
      notes: [
        {
          id: 'note-9',
          column_id: 'col-3',
          text: 'Next try the timer feature by clicking the "Timer" in the header. Start a 3 minute timer. Click on it again to stop it. Timers are not synced across clients yet so only you will see it.',
          likes: 0,
          is_new: false,
          created: '1760074762207'
        },
        {
          id: 'note-10',
          column_id: 'col-3',
          text: 'Now checkout light mode by clicking the sun icon in the header. You can toggle back to dark mode by clicking the moon icon.',
          likes: 0,
          is_new: false,
          created: '1760074762208'
        },
        {
          id: 'note-11',
          column_id: 'col-3',
          text: 'Lastly, have fun, like notes a bunch, and we hope this app helps your team achieve thoughtful converstations!',
          likes: 0,
          is_new: false,
          created: '1760074762208'
        },
      ]
    }
  ],
  addNote: () => { },
  addColumn: () => { },
  updateColumnTitle: () => { },
  deleteColumn: () => { },
  updateNote: () => { },
  deleteNote: () => { },
  moveNote: () => { },
};