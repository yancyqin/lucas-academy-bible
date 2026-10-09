import { BUILD_FEATURES } from '../build-config';

export interface Recording { id: string; text: string; url: string }
export interface RecordingRelease { enabled: boolean; clips: readonly Recording[] }

export function offlineNarration(): boolean {
  return BUILD_FEATURES.itchBuild || import.meta.env.VITE_DIST_TARGET === 'ios' ||
    import.meta.env.VITE_DIST_TARGET === 'itch';
}

/** Match complete, consecutive source verses, including collapsed picked ranges. */
export function recordingsForPassage(
  fullText: string,
  verseTexts: readonly string[] | undefined,
  catalog: RecordingRelease,
  prefix: 'cuv-fangfang' | 'web-louise',
): Recording[] | undefined {
  if (offlineNarration() || !catalog.enabled || !verseTexts?.length) return undefined;
  // Supplied-word brackets are display markup. English word boundaries matter.
  const normalize = prefix === 'web-louise'
    ? (text: string) => text.replace(/[\[\]]/gu, '').replace(/\s+/gu, ' ').trim()
    : (text: string) => text.replace(/[\s\[\]]/gu, '');
  const joiner = prefix === 'web-louise' ? ' ' : '';
  if (normalize(fullText) !== normalize(verseTexts.join(joiner))) return undefined;
  const localAudio = new RegExp(`^/audio/${prefix}/[0-9a-f]{16}/[A-Z0-9]{3}/[1-9]\\d*/[1-9]\\d*-[0-9a-f]{64}\\.mp3$`);
  const byId = new Map(catalog.clips.map((clip) => [clip.id, clip]));
  const all: Recording[] = [];
  for (const text of verseTexts) {
    const target = normalize(text);
    if (!target) return undefined;
    let found: Recording[] | undefined;
    for (const first of catalog.clips) {
      const match = /^([A-Z0-9]{3})\.(\d+)\.(\d+)$/.exec(first.id);
      if (!match || !target.startsWith(normalize(first.text))) continue;
      const [, book, chapter, number] = match;
      const clips: Recording[] = [];
      let combined = '';
      let verse = Number(number);
      while (combined.length < target.length) {
        const clip = byId.get(`${book}.${chapter}.${verse++}`);
        if (!clip || !localAudio.test(clip.url) || !normalize(clip.text)) break;
        combined += (combined ? joiner : '') + normalize(clip.text);
        if (!target.startsWith(combined)) break;
        clips.push(clip);
        if (combined === target) { found = clips; break; }
      }
      if (found) break;
    }
    if (!found) return undefined;
    all.push(...found);
  }
  return all;
}
