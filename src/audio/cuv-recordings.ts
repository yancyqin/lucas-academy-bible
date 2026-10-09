import release from '../../data/narration-cuv-fangfang-release.json';
import { offlineNarration, recordingsForPassage, type Recording, type RecordingRelease } from './recordings';

export type CuvRecording = Recording;
export type CuvRecordingRelease = RecordingRelease;

export function recordingsForCuv(
  fullText: string,
  verseTexts: readonly string[] | undefined,
  catalog: CuvRecordingRelease = release,
): CuvRecording[] | undefined {
  return recordingsForPassage(fullText, verseTexts, catalog, 'cuv-fangfang');
}

export function cuvRecordingsSupported(): boolean {
  return !offlineNarration() && release.enabled && release.clips.length > 0 &&
    typeof Audio !== 'undefined';
}
