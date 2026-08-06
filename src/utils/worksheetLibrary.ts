import { WorksheetData } from "../types";

export interface SavedWorksheet {
  id: string;
  savedAt: string; // ISO timestamp
  worksheet: WorksheetData;
}

export interface LibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const LIBRARY_KEY = 'worksheet-maker:library';

function getStorage(storage?: LibraryStorage): LibraryStorage | undefined {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return undefined;
}

export function loadLibrary(storage?: LibraryStorage): SavedWorksheet[] {
  const s = getStorage(storage);
  if (!s) return [];
  try {
    const raw = s.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWorksheet(worksheet: WorksheetData, storage?: LibraryStorage): SavedWorksheet[] {
  const s = getStorage(storage);
  const library = loadLibrary(storage);
  const entry: SavedWorksheet = {
    id: `wksht-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    worksheet,
  };
  const updated = [entry, ...library];
  if (s) s.setItem(LIBRARY_KEY, JSON.stringify(updated));
  return updated;
}

export function deleteWorksheet(id: string, storage?: LibraryStorage): SavedWorksheet[] {
  const s = getStorage(storage);
  const updated = loadLibrary(storage).filter(entry => entry.id !== id);
  if (s) s.setItem(LIBRARY_KEY, JSON.stringify(updated));
  return updated;
}
