import { describe, expect, it } from 'vitest';
import { WorksheetData } from '../types';
import { LibraryStorage, SavedWorksheet, deleteWorksheet, loadLibrary, saveWorksheet } from './worksheetLibrary';
import type { TosPlan } from './tosPlan';

/** Plain in-memory storage — no jsdom, works in Node environment. */
function makeStorage(): LibraryStorage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
    removeItem: (key) => { store.delete(key); },
  };
}

const sampleWorksheet: WorksheetData = {
  title: 'WRITTEN WORK #1',
  teacher: 'Ms. Reyes',
  school: 'Sayuna National High School',
  schoolYear: 'S.Y. 2026-2027',
  term: 'FIRST TERM',
  instructions: 'Read carefully.',
  sections: [
    {
      id: 'sec-1',
      title: 'PART I. MULTIPLE CHOICE',
      type: 'Multiple Choice',
      instructions: 'Choose the best answer.',
      questions: [
        { id: 'q1', text: 'What is photosynthesis?', type: 'Multiple Choice' },
      ],
    },
  ],
};

const sampleTosPlan: TosPlan = {
  version: 1,
  rows: [{
    id: 'tos-row-1',
    competency: 'Explain photosynthesis',
    objective: 'Describe the process',
    allocations: { Remembering: 1 },
  }],
};

const tosWorksheet: WorksheetData = {
  ...sampleWorksheet,
  sections: sampleWorksheet.sections.map(section => ({
    ...section,
    tosPlan: sampleTosPlan,
    questions: section.questions.map(question => ({
      ...question,
      tosRowId: 'tos-row-1',
      tosCognitiveLevel: 'Remembering',
    })),
  })),
};

describe('worksheetLibrary', () => {
  it('returns an empty array when storage is empty', () => {
    const storage = makeStorage();
    expect(loadLibrary(storage)).toEqual([]);
  });

  it('save adds an entry with a generated id and savedAt, newest first', () => {
    const storage = makeStorage();
    const result = saveWorksheet(sampleWorksheet, storage);

    expect(result).toHaveLength(1);
    const [entry] = result;
    expect(entry.id).toMatch(/^wksht-\d+-[a-z0-9]+$/);
    expect(entry.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.worksheet).toEqual(sampleWorksheet);
  });

  it('save prepends new entry so newest is first', () => {
    const storage = makeStorage();
    const first = saveWorksheet({ ...sampleWorksheet, title: 'First' }, storage);
    expect(first).toHaveLength(1);

    const second = saveWorksheet({ ...sampleWorksheet, title: 'Second' }, storage);
    expect(second).toHaveLength(2);
    expect(second[0].worksheet.title).toBe('Second');
    expect(second[1].worksheet.title).toBe('First');
  });

  it('save preserves all existing entries', () => {
    const storage = makeStorage();
    saveWorksheet({ ...sampleWorksheet, title: 'A' }, storage);
    saveWorksheet({ ...sampleWorksheet, title: 'B' }, storage);
    const result = saveWorksheet({ ...sampleWorksheet, title: 'C' }, storage);

    expect(result).toHaveLength(3);
    expect(result.map(e => e.worksheet.title)).toEqual(['C', 'B', 'A']);
  });

  it('delete removes only the matching id and leaves others intact', () => {
    const storage = makeStorage();
    saveWorksheet({ ...sampleWorksheet, title: 'A' }, storage);
    saveWorksheet({ ...sampleWorksheet, title: 'B' }, storage);
    const afterSave = loadLibrary(storage);
    expect(afterSave).toHaveLength(2);

    const idToDelete = afterSave[0].id; // newest = 'B'
    const afterDelete = deleteWorksheet(idToDelete, storage);

    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].worksheet.title).toBe('A');

    // Confirm storage is also updated
    expect(loadLibrary(storage)).toHaveLength(1);
  });

  it('delete with a non-existent id leaves library unchanged', () => {
    const storage = makeStorage();
    saveWorksheet(sampleWorksheet, storage);
    const result = deleteWorksheet('no-such-id', storage);
    expect(result).toHaveLength(1);
  });

  it('loadLibrary returns [] instead of throwing on corrupted JSON', () => {
    const storage = makeStorage();
    storage.setItem('worksheet-maker:library', '{not valid json[[[');
    expect(loadLibrary(storage)).toEqual([]);
  });

  it('loadLibrary returns [] when stored value is not an array', () => {
    const storage = makeStorage();
    storage.setItem('worksheet-maker:library', JSON.stringify({ oops: true }));
    expect(loadLibrary(storage)).toEqual([]);
  });

  it('round-trips worksheet data faithfully through save → load', () => {
    const storage = makeStorage();
    saveWorksheet(sampleWorksheet, storage);
    const [entry] = loadLibrary(storage) as SavedWorksheet[];
    expect(entry.worksheet).toEqual(sampleWorksheet);
  });

  it('round-trips section-level TOS plans and question metadata unchanged', () => {
    const storage = makeStorage();
    saveWorksheet(tosWorksheet, storage);

    const [entry] = loadLibrary(storage) as SavedWorksheet[];

    expect(entry.worksheet).toEqual(tosWorksheet);
    expect(entry.worksheet.sections[0].tosPlan).toEqual(sampleTosPlan);
    expect(entry.worksheet.sections[0].questions[0]).toMatchObject({
      tosRowId: 'tos-row-1',
      tosCognitiveLevel: 'Remembering',
    });
  });

  it('loads legacy sections without a tosPlan', () => {
    const storage = makeStorage();
    saveWorksheet(sampleWorksheet, storage);

    const [entry] = loadLibrary(storage) as SavedWorksheet[];

    expect(entry.worksheet.sections[0].tosPlan).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(entry.worksheet.sections[0], 'tosPlan')).toBe(false);
  });
});
