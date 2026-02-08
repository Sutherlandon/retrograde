import { pool } from "./db_config.js";

/**
 * Database initialization function, only run initial startup of the application. If th
 * queries fail, noting happens so it's only to run on every startup.
 * 
 * ONLY RUN ONCE PER DEPLOYMENT!
 */
export async function initializeDatabase() {
  const client = await pool.connect();

  try {
    // Begin transaction
    await client.query("BEGIN");

    console.log("Creating tables...");

    // Create tables if they don’t exist
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL
      );
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS columns (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        col_order INT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        column_id TEXT NOT NULL REFERENCES columns (id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        likes INTEGER NOT NULL DEFAULT 0,
        is_new BOOLEAN NOT NULL DEFAULT FALSE,
        created TEXT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        -- Stable external identifier from IdP
        external_id VARCHAR(255) NOT NULL,

        name VARCHAR(255),
        preferred_username VARCHAR(255),
        given_name VARCHAR(255),
        family_name VARCHAR(255),

        email VARCHAR(255),
        email_verified BOOLEAN,

        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

        UNIQUE (external_id)
      );
    `);

    console.log("Done");
    console.log("Starting migrations...");

    // Migration queries for updating existing tables if needed
    // 1 Add the text column if it doesn't exist
    await client.query(`
      ALTER TABLE notes
      ADD COLUMN IF NOT EXISTS created TEXT;
    `);

    // 2 Populate existing rows with the default value "1"
    await client.query(`
      UPDATE notes
      SET created = '1'
      WHERE created IS NULL;
    `);

    // 3 Set the column to NOT NULL and default to "1" for future inserts
    await client.query(`
      ALTER TABLE notes
      ALTER COLUMN created SET DEFAULT '1',
      ALTER COLUMN created SET NOT NULL;
    `);

    // 4 Move timers to the backend so it can sync across clients 
    await client.query(`
      ALTER TABLE boards
      ADD COLUMN IF NOT EXISTS timer_ends_at TIMESTAMP WITH TIME ZONE NULL,
      ADD COLUMN IF NOT EXISTS timer_duration_seconds INTEGER NULL,
      ADD COLUMN IF NOT EXISTS timer_running BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
    `);

    console.log("Done");
    console.log("Inserting dev data...");

    await client.query(`
      INSERT INTO boards (id, title)
      VALUES ('dev-test', 'Dev Test')
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO columns (id, board_id, title, col_order)
      VALUES ('dev-test-col-1', 'dev-test', 'To Do', 1)
      ON CONFLICT (id) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO notes (id, column_id, text, likes, is_new, created)
      VALUES
        ('dev-test-note-1', 'dev-test-col-1', 'This is a note', 0, FALSE, '1760074762199'),
        ('dev-test-note-2', 'dev-test-col-1', 'This is another note', 2, FALSE, '1760074762205')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Commit transaction
    await client.query("COMMIT");

    console.log("Done");
    console.log("Database initialized successfully!");

  } catch (error) {
    // Rollbak in case of error
    await client.query("ROLLBACK");
    console.error("Error during database initialization:", error);
    process.exit(1);
  } finally {
    // Release client back to pool
    client.release();
  }
}

initializeDatabase();