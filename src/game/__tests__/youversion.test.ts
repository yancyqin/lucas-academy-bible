import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LevelFile } from '../levels';
import { prepareJourneyLevel } from '../../youversion';
import { getLevelFile, LEVELS } from '../levels';
import { joinChunks } from '../chunk';
import { mulberry32 } from '../random';

const policy: LevelFile['policy'] = {
  hearts: 3,
  hintLevel: 'slots',
  granularity: 'words',
  sectionBy: 'none',
  distractorsPerSection: 1,
  memorizeSecondsPerWord: 2,
  memorizeMin: 8,
  memorizeMax: 30,
};

const translation = {
  key: 'NIV',
  label: 'NIV',
  id: 111,
  abbreviation: 'NIV',
  title: 'Test Licensed Translation',
  copyright: 'Test copyright notice.',
  promotionalContent: '',
  youVersionDeepLink: 'https://www.bible.com/versions/111',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runtime YouVersion journey levels', () => {
  it('builds the CUV challenge entirely from local public-domain text', async () => {
    const api = vi.fn();
    vi.stubGlobal('fetch', api);

    const built = await prepareJourneyLevel(getLevelFile(0)!, 'CUV', 1);

    expect(api).not.toHaveBeenCalled();
    expect(built.reference).toBe('约翰福音 11:35');
    expect(built.fullText).toBe('耶稣哭了。');
    expect(joinChunks(built.sections[0].correct)).toBe(built.fullText);
    expect(built.sections[0].correct).toEqual(['耶稣', '哭了。']);
    expect(built.attribution?.copyright).toBe('Public Domain');
  });

  it('builds every newly added question in local CUV', async () => {
    const api = vi.fn();
    vi.stubGlobal('fetch', api);

    for (const file of LEVELS.filter(
      (level) => level.level >= 1 && level.level <= 18,
    )) {
      for (
        let questionIndex = 9;
        questionIndex < file.questions.length;
        questionIndex += 1
      ) {
        let seed = 0;
        while (
          Math.floor(mulberry32(seed)() * file.questions.length) !==
          questionIndex
        ) {
          seed += 1;
        }
        const built = await prepareJourneyLevel(file, 'CUV', seed);
        expect(built.questionId).toBe(file.questions[questionIndex].id);
        expect(joinChunks(built.sections.flatMap((section) => section.correct))).toBe(
          built.fullText,
        );
      }
    }

    expect(api).not.toHaveBeenCalled();
  });

  it('uses API text for both the answer and its distractors', async () => {
    const file: LevelFile = {
      level: 8,
      policy,
      questions: [
        {
          id: 'api-q1',
          reference: 'John 11:35',
          passageId: 'passage-001',
          fragment: false,
          verses: [{ verse: 35, text: 'Static baseline one.' }],
          text: 'Static baseline one.',
        },
        {
          id: 'api-q2',
          reference: 'Psalm 119:105',
          passageId: 'passage-002',
          fragment: false,
          verses: [{ verse: 105, text: 'Static baseline two.' }],
          text: 'Static baseline two.',
        },
      ],
    };
    const apiText: Record<string, string> = {
      'JHN.11.35': 'Teacher showed compassion.',
      'PSA.119.105': 'Wisdom guides every traveler.',
    };
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const url = new URL(String(input), 'https://local.test');
        const passageId = url.searchParams.get('passage') ?? '';
        requested.push(passageId);
        return Response.json({
          passageId,
          reference: passageId === 'JHN.11.35' ? 'John 11:35' : 'Psalm 119:105',
          text: apiText[passageId],
          cache: 'MISS',
          translation,
        });
      }),
    );

    const built = await prepareJourneyLevel(file, 'NIV', 4);
    const distractors = built.sections.flatMap((section) =>
      section.bank.filter((tile) => tile.isDistractor).map((tile) => tile.text),
    );

    expect(requested).toHaveLength(2);
    expect(built.fullText).toBe(apiText[requested[0]]);
    expect(distractors).toHaveLength(1);
    expect(apiText[requested[1]]).toContain(distractors[0]);
    expect(built.fullText).not.toContain('Static baseline');
    expect(built.attribution?.copyright).toBe('Test copyright notice.');
  });

  it('chooses the corresponding translated clause for a fragment level', async () => {
    const file: LevelFile = {
      level: 1,
      policy: { ...policy, distractorsPerSection: 0 },
      questions: [
        {
          id: 'fragment-q',
          reference: '1 Corinthians 12:12d',
          passageId: 'passage-025',
          fragment: true,
          verses: [{ verse: 12, text: 'are one body;' }],
          text: 'are one body;',
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          passageId: '1CO.12.12',
          reference: '1 Corinthians 12:12',
          text: 'Many parts, one body; all belong together. Love joins them.',
          cache: 'MISS',
          translation,
        }),
      ),
    );

    const built = await prepareJourneyLevel(file, 'NIV', 1);

    expect([
      'Many parts,',
      'one body;',
      'all belong together.',
      'Love joins them.',
    ]).toContain(built.fullText);
    expect(built.reference).toBe('1 Corinthians 12:12');
    expect(built.fullText).not.toBe(file.questions[0].text);
  });

  it('uses API Chinese text as the playable answer without inserted spaces', async () => {
    const file: LevelFile = {
      level: 0,
      policy: { ...policy, distractorsPerSection: 0 },
      questions: [
        {
          id: 'ccb-q',
          reference: 'John 11:35',
          passageId: 'passage-001',
          fragment: false,
          verses: [{ verse: 35, text: 'Jesus wept.' }],
          text: 'Jesus wept.',
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          passageId: 'JHN.11.35',
          reference: '约翰福音 11:35',
          text: '耶稣哭了。',
          cache: 'MISS',
          translation: {
            ...translation,
            key: 'CCB',
            label: 'CCB',
            id: 36,
            abbreviation: 'CCB',
          },
        }),
      ),
    );

    const built = await prepareJourneyLevel(file, 'CCB', 2);

    expect(built.reference).toBe('约翰福音 11:35');
    expect(joinChunks(built.sections[0].correct)).toBe('耶稣哭了。');
  });

  it('uses API Korean text as the playable answer with its spaces preserved', async () => {
    const file: LevelFile = {
      level: 0,
      policy: { ...policy, distractorsPerSection: 0 },
      questions: [
        {
          id: 'klb-q',
          reference: 'John 11:35',
          passageId: 'passage-001',
          fragment: false,
          verses: [{ verse: 35, text: 'Jesus wept.' }],
          text: 'Jesus wept.',
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          passageId: 'JHN.11.35',
          reference: '요한복음 11:35',
          text: '예수님은 눈물을 흘리셨다.',
          cache: 'MISS',
          translation: {
            ...translation,
            key: 'KLB',
            label: 'KLB',
            id: 86,
            abbreviation: 'KLB',
          },
        }),
      ),
    );

    const built = await prepareJourneyLevel(file, 'KLB', 2);

    expect(built.reference).toBe('요한복음 11:35');
    expect(built.sections[0].correct).toEqual([
      '예수님은',
      '눈물을',
      '흘리셨다.',
    ]);
    expect(joinChunks(built.sections[0].correct)).toBe(
      '예수님은 눈물을 흘리셨다.',
    );
  });
});
