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

const dropplet: { connectionString: string; ssl?: object } = { connectionString };

export const pool = new Pool(dropplet);

// Site admin IDs — external_id values (from the OAuth provider) that always
// have access to the admin dashboard and can manage other admins.
// Set via SITE_ADMIN_IDS in your environment (comma-separated).
const rawSiteAdminIds = process.env.SITE_ADMIN_IDS ?? "";
export const siteAdminIds: string[] = rawSiteAdminIds
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

if (siteAdminIds.length === 0) {
  console.warn("Warning: SITE_ADMIN_IDS is not set — the admin dashboard will be inaccessible.");
}

// OAuth redirect URI — use VERCEL_URL for preview deployments, fall back to
// the explicit OAUTH_REDIRECT_URI for local dev and production.
export const oauthRedirectUri = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/auth/callback`
  : process.env.OAUTH_REDIRECT_URI!;
