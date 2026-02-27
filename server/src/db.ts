import Database from "better-sqlite3";

const DB_PATH = process.env.DATABASE_PATH || "./ducktape.db";

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    picture TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    encrypted_key TEXT NOT NULL,
    iv TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// Prepared statements
const findUserByGoogleId = db.prepare(
  "SELECT * FROM users WHERE google_id = ?"
);
const insertUser = db.prepare(
  "INSERT INTO users (google_id, email, name, picture) VALUES (?, ?, ?, ?)"
);
const findUserById = db.prepare("SELECT * FROM users WHERE id = ?");

const upsertApiKey = db.prepare(`
  INSERT INTO api_keys (user_id, encrypted_key, iv, updated_at)
  VALUES (?, ?, ?, unixepoch())
  ON CONFLICT(user_id) DO UPDATE SET
    encrypted_key = excluded.encrypted_key,
    iv = excluded.iv,
    updated_at = unixepoch()
`);
const selectApiKey = db.prepare(
  "SELECT encrypted_key, iv FROM api_keys WHERE user_id = ?"
);
const removeApiKey = db.prepare("DELETE FROM api_keys WHERE user_id = ?");
const apiKeyExists = db.prepare(
  "SELECT 1 FROM api_keys WHERE user_id = ?"
);

export interface DbUser {
  id: number;
  google_id: string;
  email: string;
  name: string;
  picture: string | null;
  created_at: number;
}

export function findOrCreateUser(
  googleId: string,
  email: string,
  name: string,
  picture: string | null
): DbUser {
  const existing = findUserByGoogleId.get(googleId) as DbUser | undefined;
  if (existing) return existing;

  const result = insertUser.run(googleId, email, name, picture);
  return findUserById.get(result.lastInsertRowid) as DbUser;
}

export function getUserById(id: number): DbUser | undefined {
  return findUserById.get(id) as DbUser | undefined;
}

export function saveApiKey(
  userId: number,
  encryptedKey: string,
  iv: string
): void {
  upsertApiKey.run(userId, encryptedKey, iv);
}

export function getApiKey(
  userId: number
): { encrypted_key: string; iv: string } | undefined {
  return selectApiKey.get(userId) as
    | { encrypted_key: string; iv: string }
    | undefined;
}

export function deleteApiKey(userId: number): void {
  removeApiKey.run(userId);
}

export function hasApiKey(userId: number): boolean {
  return apiKeyExists.get(userId) !== undefined;
}
