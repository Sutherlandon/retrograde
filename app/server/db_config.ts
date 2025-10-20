import { Pool } from "pg";

interface Env {
  database_url?: string;
  host?: string;
  username?: string;
  password?: string;
  scheme?: string;
}

function maskMiddleChars(str: string): string {
  if (str.length <= 2) {
    return str;
  }

  const firstChar = str.charAt(0);
  const lastChar = str.charAt(str.length - 1);
  const middleAsterisks = '*'.repeat(str.length - 2);

  return `${firstChar}${middleAsterisks}${lastChar}`;
}

function maskedConnectionString(input: string): string {
  // Split the input string into its components
  const [protocol, , middle, schema] = input.split('/');
  const [username, rest] = middle.split(':');
  const [password, host] = rest.split('@');

  // Mask the username and password
  const maskedUsername = maskMiddleChars(username);
  const maskedPassword = maskMiddleChars(password);
  const maskedHost = maskMiddleChars(host);

  // Reconstruct the masked connection string
  const maskedInput = `${protocol}//${maskedUsername}:${maskedPassword}@${maskedHost}/${schema}`;
  return maskedInput;
}

// Load environment variables from process.env
const env: Env = {
  database_url: process.env.DATABASE_URL,
  host: process.env.PG_HOST,
  username: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  scheme: process.env.PG_SCHEMA,
};

// Create the connection string
const connectionString = env.database_url || `postgresql://${env.username}:${env.password}@${env.host}/${env.scheme}`;

console.log("connecting to database");
console.log(maskedConnectionString(connectionString));

// Create a new pool instance
console.log("NODE_ENV", process.env.NODE_ENV);
const enableSSL = process.env.NODE_ENV !== "development";

const dropplet: { connectionString: string; ssl?: object } = { connectionString }

export const pool = new Pool(dropplet);

/**
 * Database initialization function, only run initial startup of the application. If th
 * queries fail, noting happens so it's only to run on every startup.
 */
export async function initializeDatabase() {
  const client = await pool.connect();

  try {
    // Begin transaction
    await client.query("BEGIN");

    console.log("Creating tables...");

    // Create tables if they don’t exist
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

    console.log("Done");
    console.log("Starting migrations...");

    // Migration for adding 'created' column if it doesn't exist
    await client.query(`
      -- 1 Add the column if it doesn't exist
      ALTER TABLE notes
      ADD COLUMN IF NOT EXISTS created TEXT;

      -- 2 Populate existing rows with the default value "1"
      UPDATE notes
      SET created = '1'
      WHERE created IS NULL;

      -- 3 Set the column to NOT NULL and default to "1" for future inserts
      ALTER TABLE notes
      ALTER COLUMN created SET DEFAULT '1',
      ALTER COLUMN created SET NOT NULL;
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
