import { describe, expect, it } from 'vitest';
import { autoChunk, chunksReproduce, isContentWord, splitSentences } from '../chunk';

describe('autoChunk (content-word tiles)', () => {
  it('keeps content words as their own tiles', () => {
    expect(autoChunk('Jesus wept.')).toEqual(['Jesus', 'wept.']);
  });

  it('never leaves a function word (虚词) standing alone', () => {
    const samples = [
      'In the beginning, God created the heavens and the earth.',
      'For God so loved the world, that he gave his only born Son,',
      'one Lord, one faith, one baptism,',
      'Your word is a lamp to my feet, and a light for my path.',
      '“You are the light of the world.',
    ];
    for (const text of samples) {
      const chunks = autoChunk(text);
      expect(chunksReproduce(text, chunks), text).toBe(true); // nothing dropped/added
      for (const c of chunks) {
        expect(c.split(' ').some(isContentWord), `"${c}" in "${text}"`).toBe(true);
      }
    }
  });

  it('attaches leading 虚词 forward to the next content word', () => {
    expect(autoChunk('In the beginning, God created the heavens and the earth.')).toEqual([
      'In the beginning,',
      'God',
      'created',
      'the heavens',
      'and the earth.',
    ]);
  });

  it('classifies the/of/him/it/this as function words, God/wept as content', () => {
    for (const w of ['the', 'of', 'him', 'it', 'this', 'is', 'and']) {
      expect(isContentWord(w), w).toBe(false);
    }
    for (const w of ['God', 'wept.', 'world,', 'Jesus', 'one']) {
      expect(isContentWord(w), w).toBe(true);
    }
  });

  it('produces no empty tiles', () => {
    for (const c of autoChunk('“You are the light of the world.')) {
      expect(c.trim().length).toBeGreaterThan(0);
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
