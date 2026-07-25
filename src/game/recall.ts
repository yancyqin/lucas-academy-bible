import type { BuiltLevel, Tile } from './build';

/**
 * Pure runtime state machine for one recall attempt. No React, no DOM — fully
 * unit-testable. The UI dispatches actions and reacts to `lastEvent`
 * (for sound + screen-reader announcements) via the incrementing `eventSeq`.
 */

export type RecallEvent =
  | { kind: 'correct'; tileId: string; streak: number }
  | { kind: 'wrong'; tileId: string; heartsLeft: number }
  | { kind: 'undo' }
  | { kind: 'section-advance'; sectionIndex: number }
  | { kind: 'level-complete' }
  | { kind: 'failed' };

export interface RecallState {
  level: BuiltLevel;
  sectionIndex: number;
  placed: Tile[];
  bank: Tile[];
  hearts: number;
  /** Wrong clicks in the CURRENT attempt (reset by restart / re-init). */
  mistakes: number;
  /** Fully reconstructed text of sections already finished this attempt. */
  completedSections: string[];
  status: 'playing' | 'complete' | 'failed';
  lastEvent: RecallEvent | null;
  eventSeq: number;
}

export type RecallAction =
  | { type: 'select'; tileId: string }
  | { type: 'undo' }
  | { type: 'restart' };

export function initRecall(level: BuiltLevel): RecallState {
  return {
    level,
    sectionIndex: 0,
    placed: [],
    bank: level.sections[0]?.bank ?? [],
    hearts: level.hearts,
    mistakes: 0,
    completedSections: [],
    status: 'playing',
    lastEvent: null,
    eventSeq: 0,
  };
}

/** The chunk the player must place next, or undefined when the section is full. */
export function expectedChunk(state: RecallState): string | undefined {
  const section = state.level.sections[state.sectionIndex];
  return section?.correct[state.placed.length];
}

export function recallReducer(state: RecallState, action: RecallAction): RecallState {
  const seq = state.eventSeq + 1;

  switch (action.type) {
    case 'restart':
      return initRecall(state.level);

    case 'undo': {
      if (state.status !== 'playing' || state.placed.length === 0) return state;
      const last = state.placed[state.placed.length - 1];
      return {
        ...state,
        placed: state.placed.slice(0, -1),
        bank: [...state.bank, last],
        lastEvent: { kind: 'undo' },
        eventSeq: seq,
      };
    }

    case 'select': {
      if (state.status !== 'playing') return state;
      const section = state.level.sections[state.sectionIndex];
      const tile = state.bank.find((t) => t.id === action.tileId);
      if (!tile) return state;

      const expected = section.correct[state.placed.length];
      // A distractor never shares text with a correct chunk in this section,
      // so a text match uniquely identifies a correct selection. Repeated words
      // work because we only compare against the *current* expected chunk.
      const isCorrect = tile.text === expected;

      if (!isCorrect) {
        const hearts = state.hearts - 1;
        const mistakes = state.mistakes + 1;
        if (hearts <= 0) {
          return {
            ...state,
            hearts: 0,
            mistakes,
            status: 'failed',
            lastEvent: { kind: 'failed' },
            eventSeq: seq,
          };
        }
        return {
          ...state,
          hearts,
          mistakes,
          lastEvent: { kind: 'wrong', tileId: tile.id, heartsLeft: hearts },
          eventSeq: seq,
        };
      }

      // Correct selection.
      const placed = [...state.placed, tile];
      const bank = state.bank.filter((t) => t.id !== tile.id);
      const sectionComplete = placed.length === section.correct.length;

      if (!sectionComplete) {
        return {
          ...state,
          placed,
          bank,
          lastEvent: { kind: 'correct', tileId: tile.id, streak: placed.length },
          eventSeq: seq,
        };
      }

      // Section finished.
      const completedSections = [...state.completedSections, section.correct.join(' ')];
      const isLastSection = state.sectionIndex === state.level.sections.length - 1;

      if (isLastSection) {
        return {
          ...state,
          placed,
          bank,
          completedSections,
          status: 'complete',
          lastEvent: { kind: 'level-complete' },
          eventSeq: seq,
        };
      }

      const nextIndex = state.sectionIndex + 1;
      const nextSection = state.level.sections[nextIndex];
      return {
        ...state,
        sectionIndex: nextIndex,
        placed: [],
        bank: nextSection.bank,
        completedSections,
        lastEvent: { kind: 'section-advance', sectionIndex: nextIndex },
        eventSeq: seq,
      };
    }

    default:
      return state;
  }
}
