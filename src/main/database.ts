import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'path'

const dbPath = join(app.getPath('userData'), 'safenest.db')
let db: DatabaseSync | null = null

export function initDatabase(): void {
  db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS vault (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function vaultGet(key: string): string | null {
  if (!db) throw new Error('Database not initialized')
  const row = db.prepare('SELECT value FROM vault WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row ? row.value : null
}

export function vaultSet(key: string, value: string): boolean {
  if (!db) throw new Error('Database not initialized')
  try {
    db.prepare('INSERT OR REPLACE INTO vault (key, value) VALUES (?, ?)').run(key, value)
    return true
  } catch {
    return false
  }
}

export function vaultRemove(key: string): boolean {
  if (!db) throw new Error('Database not initialized')
  try {
    db.prepare('DELETE FROM vault WHERE key = ?').run(key)
    return true
  } catch {
    return false
  }
}

export function vaultHas(key: string): boolean {
  if (!db) throw new Error('Database not initialized')
  const row = db.prepare('SELECT 1 FROM vault WHERE key = ?').get(key) as
    | { 1: number }
    | undefined
  return !!row
}

export function settingGet(key: string): string | null {
  if (!db) throw new Error('Database not initialized')
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row ? row.value : null
}

export function settingSet(key: string, value: string): boolean {
  if (!db) throw new Error('Database not initialized')
  try {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
    return true
  } catch {
    return false
  }
}

export function settingRemove(key: string): boolean {
  if (!db) throw new Error('Database not initialized')
  try {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key)
    return true
  } catch {
    return false
  }
}
