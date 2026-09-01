import { describe, expect, it } from 'vitest';
import { detectSpeechLanguage, segmentForSpeech } from '../speech';

describe('segmentForSpeech (slow, gap-paced narration)', () => {
  it('splits a long verse into several clause segments', () => {
    const text =
      'For God so loved the world, that he gave his only born Son, that whoever believes in him should not perish, but have eternal life.';
    const segments = segmentForSpeech(text);
    expect(segments.length).toBeGreaterThan(1);
    // segments rejoin to the source (nothing dropped or added)
    expect(segments.join(' ')).toBe(text);
  });

  it('handles a short text as a single segment', () => {
    expect(segmentForSpeech('Jesus wept.')).toEqual(['Jesus wept.']);
  });

  it('segments Chinese clauses without inserting spaces', () => {
    const text = '神爱世人，甚至赐下独生子。信他的人有永生。';
    const segments = segmentForSpeech(text);

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.join('')).toBe(text);
  });

  it('segments Korean without dropping or merging its word spaces', () => {
    const text =
      '여호와는 나의 목자시니 내가 부족함이 없으리로다. 그가 나를 푸른 풀밭에 누이시며 쉴 만한 물가로 인도하시는도다.';
    const segments = segmentForSpeech(text);

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.join(' ')).toBe(text);
  });
});

describe('detectSpeechLanguage', () => {
  it('selects Korean narration for Hangul scripture', () => {
    expect(detectSpeechLanguage('예수님은 눈물을 흘리셨다.')).toBe('ko');
    expect(detectSpeechLanguage('耶稣哭了。')).toBe('zh');
    expect(detectSpeechLanguage('Jesus wept.')).toBe('en');
  });
});
