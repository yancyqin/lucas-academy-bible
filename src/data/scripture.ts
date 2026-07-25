import rawData from '../../data/verses.json';

/**
 * Types describing the shape of data/verses.json.
 * The file is READ-ONLY from this app's perspective — we never rewrite,
 * modernize, or normalize the scripture text. World English Bible (WEB)
 * Classic is public domain.
 */
export interface ScriptureVerse {
  verse: number;
  text: string;
}

export interface Passage {
  id: string;
  order: number;
  reference: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  verses: ScriptureVerse[];
  /** The full passage text — for multi-verse passages this equals the verse
   * texts joined by a single space. */
  text: string;
  requestedAs?: string;
  matchNote?: string;
}

export interface ScriptureData {
  metadata: {
    title: string;
    translation: {
      id: string;
      name: string;
      license: string;
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
  passages: Passage[];
}

const data = rawData as unknown as ScriptureData;

export const scripture: ScriptureData = data;

const byId = new Map<string, Passage>();
for (const p of data.passages) {
  byId.set(p.id, p);
}

/** Look up a passage by its stable id (e.g. "passage-001"). */
export function getPassage(id: string): Passage | undefined {
  return byId.get(id);
}

/** Look up a passage or throw — used where a level config guarantees existence. */
export function requirePassage(id: string): Passage {
  const p = byId.get(id);
  if (!p) throw new Error(`Passage not found: ${id}`);
  return p;
}

export const allPassages: Passage[] = data.passages;

export const translationInfo = data.metadata.translation;
