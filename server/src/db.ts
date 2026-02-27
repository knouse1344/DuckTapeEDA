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

  CREATE TABLE IF NOT EXISTS designs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    design_json TEXT NOT NULL,
    chat_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_designs_user ON designs(user_id, updated_at DESC);
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

// Design statements
const insertDesignStmt = db.prepare(`
  INSERT INTO designs (user_id, name, description, design_json, chat_json)
  VALUES (?, ?, ?, ?, ?)
`);
const updateDesignStmt = db.prepare(`
  UPDATE designs SET name = ?, description = ?, design_json = ?, chat_json = ?, updated_at = unixepoch()
  WHERE id = ? AND user_id = ?
`);
const listDesignsStmt = db.prepare(
  "SELECT id, name, description, created_at, updated_at FROM designs WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50"
);
const getDesignStmt = db.prepare(
  "SELECT * FROM designs WHERE id = ? AND user_id = ?"
);
const deleteDesignStmt = db.prepare(
  "DELETE FROM designs WHERE id = ? AND user_id = ?"
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

// Design CRUD

export interface DbDesign {
  id: number;
  user_id: number;
  name: string;
  description: string;
  design_json: string;
  chat_json: string;
  created_at: number;
  updated_at: number;
}

export interface DbDesignSummary {
  id: number;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
}

export function insertDesign(
  userId: number,
  name: string,
  description: string,
  designJson: string,
  chatJson: string
): number {
  const result = insertDesignStmt.run(userId, name, description, designJson, chatJson);
  return result.lastInsertRowid as number;
}

export function updateDesign(
  id: number,
  userId: number,
  name: string,
  description: string,
  designJson: string,
  chatJson: string
): boolean {
  const result = updateDesignStmt.run(name, description, designJson, chatJson, id, userId);
  return result.changes > 0;
}

export function listDesigns(userId: number): DbDesignSummary[] {
  return listDesignsStmt.all(userId) as DbDesignSummary[];
}

export function getDesign(id: number, userId: number): DbDesign | undefined {
  return getDesignStmt.get(id, userId) as DbDesign | undefined;
}

export function deleteDesign(id: number, userId: number): boolean {
  const result = deleteDesignStmt.run(id, userId);
  return result.changes > 0;
}
