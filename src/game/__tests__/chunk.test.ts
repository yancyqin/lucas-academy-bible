import { describe, expect, it } from 'vitest';
import { autoChunk, chunksReproduce, splitSentences } from '../chunk';

describe('autoChunk', () => {
  it("'words' gives one tile per word", () => {
    expect(autoChunk('Jesus wept.', 'words')).toEqual(['Jesus', 'wept.']);
  });

  it('always reproduces the source text when joined', () => {
    const samples = [
      'In the beginning, God created the heavens and the earth.',
      'For God so loved the world, that he gave his only born Son,',
      'one Lord, one faith, one baptism,',
      'Rejoice in the Lord always!',
    ];
    for (const text of samples) {
      for (const g of ['words', 'short', 'phrase'] as const) {
        expect(chunksReproduce(text, autoChunk(text, g)), `${g}: ${text}`).toBe(true);
      }
    }
  });

  it('never returns a single tile for a multi-word verse', () => {
    // A short phrase with no internal punctuation still splits.
    expect(autoChunk('Have this in mind', 'phrase').length).toBeGreaterThanOrEqual(2);
  });

  it('breaks phrase-level text at clause punctuation', () => {
    const chunks = autoChunk('In the beginning, God created the heavens and the earth.', 'phrase');
    expect(chunks[0]).toBe('In the beginning,');
    expect(chunks.join(' ')).toBe('In the beginning, God created the heavens and the earth.');
  });

  it('produces no empty or punctuation-only tiles', () => {
    const chunks = autoChunk('“You are the light of the world.', 'short');
    for (const c of chunks) {
      expect(c.trim().length).toBeGreaterThan(0);
      expect(/[A-Za-z0-9’]/.test(c)).toBe(true); // contains a real letter/word
    }
  });
});

describe('splitSentences', () => {
  it('splits at sentence boundaries and rejoins exactly', () => {
    const text = 'He has made everything beautiful. He set eternity in their hearts.';
    const s = splitSentences(text);
    expect(s.length).toBe(2);
    expect(s.join(' ')).toBe(text);
  });

  it('returns the whole text when there is a single sentence', () => {
    const text = 'looking to Jesus, the author and perfecter of faith';
    expect(splitSentences(text)).toEqual([text]);
  });
});
