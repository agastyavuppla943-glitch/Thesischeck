import * as fs from 'fs';
import * as path from 'path';

/**
 * Minimal JSON-file backed persistence.
 * Each "collection" is a single JSON array file under the project's data/ dir.
 * Good enough for a single-user advisory agent; swap for a real DB in production.
 */

const DATA_DIR = path.join(process.cwd(), 'data');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function fileFor(collection: string): string {
  return path.join(DATA_DIR, `${collection}.json`);
}

export function readCollection<T>(collection: string): T[] {
  ensureDataDir();
  const file = fileFor(collection);
  if (!fs.existsSync(file)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendToCollection<T>(collection: string, entry: T): T {
  ensureDataDir();
  const items = readCollection<T>(collection);
  items.push(entry);
  fs.writeFileSync(fileFor(collection), JSON.stringify(items, null, 2), 'utf-8');
  return entry;
}

export function writeCollection<T>(collection: string, items: T[]): void {
  ensureDataDir();
  fs.writeFileSync(fileFor(collection), JSON.stringify(items, null, 2), 'utf-8');
}

export function readSingleton<T>(key: string, fallback: T): T {
  ensureDataDir();
  const file = fileFor(`singleton_${key}`);
  if (!fs.existsSync(file)) {
    return fallback;
  }
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeSingleton<T>(key: string, value: T): void {
  ensureDataDir();
  fs.writeFileSync(fileFor(`singleton_${key}`), JSON.stringify(value, null, 2), 'utf-8');
}
