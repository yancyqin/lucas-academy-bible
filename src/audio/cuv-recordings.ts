import release from '../../data/narration-cuv-fangfang-release.json';
import { BUILD_FEATURES } from '../build-config';

export interface CuvRecording {
  id: string;
  text: string;
  url: string;
}

export interface CuvRecordingRelease {
  enabled: boolean;
  clips: readonly CuvRecording[];
}

// eBible whitespace and supplied-word brackets are display markup. Keep all
// spoken words and punctuation when checking that a clip matches the passage.
function spokenText(text: string): string {
  return text.replace(/[\s\[\]]/gu, '');
}

function offlineBuild(): boolean {
  return BUILD_FEATURES.itchBuild || import.meta.env.VITE_DIST_TARGET === 'ios' ||
    import.meta.env.VITE_DIST_TARGET === 'itch';
}

const LOCAL_AUDIO = /^\/audio\/cuv-fangfang\/[0-9a-f]{16}\/[A-Z0-9]{3}\/[1-9]\d*\/[1-9]\d*-[0-9a-f]{64}\.mp3$/;

function recordingsForText(text: string, catalog: CuvRecordingRelease): CuvRecording[] | undefined {
  const target = spokenText(text);
  if (!target) return undefined;
  // Picked passage ranges arrive as one verse entry. Match only complete,
  // consecutive verses, rather than guessing boundaries from punctuation.
  for (const first of catalog.clips) {
    const match = /^([A-Z0-9]{3})\.(\d+)\.(\d+)$/.exec(first.id);
    if (!match || !target.startsWith(spokenText(first.text))) continue;
    const [, book, chapter, number] = match;
    const clips: CuvRecording[] = [];
    let combined = '';
    let verse = Number(number);
    while (combined.length < target.length) {
      const id = `${book}.${chapter}.${verse}`;
      const clip = catalog.clips.find((candidate) => candidate.id === id);
      if (!clip || !LOCAL_AUDIO.test(clip.url) || !spokenText(clip.text)) break;
      verse += 1;
      combined += spokenText(clip.text);
      if (!target.startsWith(combined)) break;
      clips.push(clip);
      if (combined === target) return clips;
    }
  }
  return undefined;
}

export function recordingsForCuv(
  fullText: string,
  verseTexts: readonly string[] | undefined,
  catalog: CuvRecordingRelease = release,
): CuvRecording[] | undefined {
  if (offlineBuild() || !catalog.enabled || !verseTexts?.length) return undefined;
  if (spokenText(fullText) !== spokenText(verseTexts.join(''))) return undefined;
  const groups = verseTexts.map((text) => recordingsForText(text, catalog));
  // Require the whole passage. Missing verses and fragments retain the
  // browser voice instead of silently dropping part of the scripture.
  if (groups.some((group) => !group)) return undefined;
  return (groups as CuvRecording[][]).flat();
}

export function cuvRecordingsSupported(): boolean {
  return !offlineBuild() && release.enabled && release.clips.length > 0 &&
    typeof Audio !== 'undefined';
}
