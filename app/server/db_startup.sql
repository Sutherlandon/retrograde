-- 1. Connect to the default postgres DB
-- 2. Create the database

CREATE DATABASE retrograde
WITH
    OWNER = postgres -- replace with your actual username
    ENCODING = 'UTF8' LC_COLLATE = 'en_US.UTF-8' LC_CTYPE = 'en_US.UTF-8' TEMPLATE = template0;

-- 3. Connect to the new database
\c retrograde;

-- 5. Create tables
-- Boards

-- Boards table
CREATE TABLE boards (
    id TEXT PRIMARY KEY, -- now a string, not UUID
    title TEXT NOT NULL
);

-- Columns table
CREATE TABLE columns (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    col_order SERIAL NOT NULL -- auto-incrementing order
);

-- Notes table
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    column_id TEXT NOT NULL REFERENCES columns (id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    likes INTEGER NOT NULL DEFAULT 0,
    is_new BOOLEAN NOT NULL DEFAULT FALSE
);

-- Insert board with fixed string ID
INSERT INTO
    boards (id, title)
VALUES (
        'example-board',
        'Example Board'
    );

-- Insert column
INSERT INTO
    columns (id, board_id, title)
VALUES (
        'col-1',
        'example-board',
        'To Do'
    )

-- Insert notes with fixed ids
INSERT INTO
    notes (
        id,
        column_id,
        text,
        likes,
        is_new
    )
VALUES (
        'note-1',
        'col-1',
        'This is a note',
        0,
        FALSE
    ),
    (
        'note-2',
        'col-1',
        'This is another note',
        2,
        FALSE
    );