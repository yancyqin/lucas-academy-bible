import { allPassages } from './scripture';

export const BOOK_CODES: Record<string, string> = {
  Genesis: 'GEN', Joshua: 'JOS', Psalm: 'PSA', Proverbs: 'PRO', Ecclesiastes: 'ECC',
  Isaiah: 'ISA', Joel: 'JOL', Hosea: 'HOS', Matthew: 'MAT', Luke: 'LUK', John: 'JHN',
  Romans: 'ROM', '1 Corinthians': '1CO', '2 Corinthians': '2CO', Galatians: 'GAL',
  Ephesians: 'EPH', Philippians: 'PHP', Hebrews: 'HEB', '1 Peter': '1PE', '1 John': '1JN',
};
const texts = new Map<string, string>();
for (const passage of allPassages) {
  for (const verse of passage.verses) {
    texts.set(`${BOOK_CODES[passage.book]}.${passage.chapter}.${verse.verse}`, verse.text);
  }
}

/** A complete curated selection from the same WEB Classic source as Challenge and audio. */
export function bundledWebPassage(passageId: string): { reference: string; text: string } | undefined {
  const match = /^([A-Z0-9]{3})\.([1-9]\d*)\.([1-9]\d*)(?:-([1-9]\d*))?$/.exec(passageId);
  if (!match) return undefined;
  const [, book, chapter, first, last = first] = match;
  const name = Object.keys(BOOK_CODES).find((name) => BOOK_CODES[name] === book);
  if (!name || Number(last) < Number(first) || Number(last) - Number(first) > 175) return undefined;
  const verses: string[] = [];
  for (let verse = Number(first); verse <= Number(last); verse++) {
    const text = texts.get(`${book}.${chapter}.${verse}`);
    if (!text) return undefined;
    verses.push(text);
  }
  return { reference: `${name} ${chapter}:${first}${first === last ? '' : `-${last}`}`, text: verses.join(' ') };
}
