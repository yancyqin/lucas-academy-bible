import { describe, expect, it } from 'vitest';
import {
  formatPassageId,
  MAX_VERSE_SPAN,
  parsePassageId,
  readVerseLink,
  verseLinkParams,
  verseLinkUrl,
  verseNumbers,
} from '../../verse-request';

describe('YouVersion passage ids', () => {
  it('formats single verses and ranges the way YouVersion addresses them', () => {
    expect(formatPassageId({ book: 'JHN', chapter: 3, verse: 16 })).toBe(
      'JHN.3.16',
    );
    expect(
      formatPassageId({ book: 'PSA', chapter: 23, verse: 1, endVerse: 3 }),
    ).toBe('PSA.23.1-3');
    expect(
      formatPassageId({ book: '1CO', chapter: 13, verse: 4, endVerse: 4 }),
    ).toBe('1CO.13.4');
  });

  it('round-trips every id it accepts', () => {
    // Three characters always, sometimes leading with a digit (1CO) and
    // sometimes carrying one (S3Y).
    for (const id of ['JHN.3.16', 'PSA.23.1-3', '1CO.13.4-7', '3JN.1.4', 'S3Y.1.2']) {
      expect(formatPassageId(parsePassageId(id)!)).toBe(id);
    }
  });

  it('rejects ids the passage API would not accept', () => {
    for (const id of [
      '',
      'John 3:16',
      'JHN.3',
      'JHN.3.0',
      'JHN.0.1',
      'JHN.3.16-15',
      'JH.3.16',
      'JOHN.3.16',
    ]) {
      expect(parsePassageId(id)).toBeNull();
    }
  });

  it('lists the verses a request covers', () => {
    expect(verseNumbers({ book: 'PSA', chapter: 23, verse: 1 })).toEqual([1]);
    expect(
      verseNumbers({ book: 'PSA', chapter: 23, verse: 4, endVerse: 6 }),
    ).toEqual([4, 5, 6]);
  });
});

describe('deep links', () => {
  it('plays the passage named in the query string', () => {
    expect(readVerseLink('?passage=JHN.3.16&translation=NIV&difficulty=hard')).toEqual({
      request: { book: 'JHN', chapter: 3, verse: 16 },
      translation: 'NIV',
      difficulty: 'hard',
    });
  });

  it("accepts YouVersion's own numeric Bible id", () => {
    expect(readVerseLink('?passage=PSA.23.1-3&version=111')).toEqual({
      request: { book: 'PSA', chapter: 23, verse: 1, endVerse: 3 },
      translation: 'NIV',
      difficulty: 'normal',
    });
  });

  it('falls back to normal difficulty and the saved edition', () => {
    expect(readVerseLink('?passage=jhn.3.16&difficulty=impossible')).toEqual({
      request: { book: 'JHN', chapter: 3, verse: 16 },
      difficulty: 'normal',
    });
    expect(readVerseLink('?passage=JHN.3.16&translation=ESV')).toEqual({
      request: { book: 'JHN', chapter: 3, verse: 16 },
      difficulty: 'normal',
    });
  });

  it('caps a hand-edited range at the span the picker offers', () => {
    // Psalm 119 in one round would be 176 verses against a 45-second timer.
    expect(readVerseLink('?passage=PSA.119.1-176')?.request).toEqual({
      book: 'PSA',
      chapter: 119,
      verse: 1,
      endVerse: MAX_VERSE_SPAN,
    });
    expect(readVerseLink('?passage=PSA.23.1-3')?.request).toEqual({
      book: 'PSA',
      chapter: 23,
      verse: 1,
      endVerse: 3,
    });
  });

  it('ignores a query string with no usable passage', () => {
    expect(readVerseLink('')).toBeNull();
    expect(readVerseLink('?translation=NIV')).toBeNull();
    expect(readVerseLink('?passage=Psalm+23')).toBeNull();
  });

  it('builds a link that reads back as the same selection', () => {
    const link = {
      request: { book: 'PSA', chapter: 23, verse: 1, endVerse: 4 },
      translation: 'CUV' as const,
      difficulty: 'practice' as const,
    };
    const url = verseLinkUrl(link, 'https://bible.lucasacademy.org/play?stale=1#top');

    expect(url).toBe(
      'https://bible.lucasacademy.org/play?passage=PSA.23.1-4&translation=CUV&difficulty=practice',
    );
    expect(readVerseLink(new URL(url).search)).toEqual(link);
  });

  it('leaves the default difficulty out of the link', () => {
    expect(
      verseLinkParams({
        request: { book: 'JHN', chapter: 3, verse: 16 },
        translation: 'WEB',
        difficulty: 'normal',
      }),
    ).toBe('passage=JHN.3.16&translation=WEB');
  });
});
