-- Create tables
CREATE TABLE boards (
    id TEXT PRIMARY KEY, -- now a string, not UUID
    title TEXT NOT NULL
);

CREATE TABLE columns (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    col_order INT NOT NULL
);

CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    column_id TEXT NOT NULL REFERENCES columns (id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    likes INTEGER NOT NULL DEFAULT 0,
    is_new BOOLEAN NOT NULL DEFAULT FALSE
);

-- Example Board Data
INSERT INTO
    boards (id, title)
VALUES (
        'example-board',
        'Example Board'
    );

INSERT INTO
    columns (
        id,
        board_id,
        title,
        col_order
    )
VALUES (
        'col-1',
        'example-board',
        'To Do',
        1
    )

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