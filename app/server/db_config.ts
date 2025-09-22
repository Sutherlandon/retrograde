import { Pool } from "pg";

interface Env {
  DATABASE_URL: string; // for platforms like Heroku
}

// Load environment variables from process.env
const env: Env = {
  DATABASE_URL: process.env.DATABASE_URL || 'ERROR_DATABASE_URL_NOT_SET', // for platforms like Heroku
};

// Create the connection string
const connectionString = env.DATABASE_URL;

// Create a new pool instance
export const pool = new Pool({
  connectionString,
});
