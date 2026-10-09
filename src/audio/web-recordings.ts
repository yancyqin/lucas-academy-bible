import release from '../../data/narration-web-louise-release.json';
import { offlineNarration, recordingsForPassage, type Recording, type RecordingRelease } from './recordings';

export function recordingsForWeb(
  fullText: string,
  verseTexts: readonly string[] | undefined,
  catalog: RecordingRelease = release,
): Recording[] | undefined {
  return recordingsForPassage(fullText, verseTexts, catalog, 'web-louise');
}

export function webRecordingsSupported(): boolean {
  return !offlineNarration() && release.enabled && release.clips.length > 0 &&
    typeof Audio !== 'undefined';
}
