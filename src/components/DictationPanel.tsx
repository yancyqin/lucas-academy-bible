import { useEffect, useRef, useState } from 'react';
import type { SoundEngine } from '../audio/sound';
import type { BuiltLevel } from '../game/build';
import { dictationSegments, gradeDictation, type DictationResult } from '../game/dictation';

interface DictationPanelProps {
  built: BuiltLevel;
  /** Show the screen's own words in Chinese (the passage is Chinese). */
  chinese: boolean;
  sound: SoundEngine;
  announce: (message: string, assertive?: boolean) => void;
  modeLabel?: string;
  /** What has been written so far; kept by the parent across a look back. */
  draft: string;
  onDraftChange: (draft: string) => void;
  /** Back to the memorize screen to read the verse again. */
  onBack: () => void;
}

const pct = (share: number) => Math.round(share * 100);

const LEGEND = [
  'dictation-mark--correct',
  'dictation-mark--wrong',
  'dictation-mark--missing',
  'dictation-mark--extra',
];

const TEXT = {
  en: {
    eyebrow: 'Write from memory',
    prompt: 'Write the verse from memory, then tap Submit.',
    placeholder: 'Write the verse here…',
    label: 'Your verse',
    submit: 'Submit',
    back: 'Look again',
    perfect: 'Perfect! Every word is right.',
    done: 'Here is how you did',
    accuracy: 'Accuracy',
    right: (n: number, total: number) => `${n} of ${total} words right`,
    wrong: 'wrong',
    missing: 'missed',
    extra: 'extra',
    legend: ['Right', 'Wrong', 'Missed', 'Extra'],
    yours: 'What you wrote',
    wrote: (typed: string) => `you wrote “${typed}”`,
    again: 'Write again',
  },
  zh: {
    eyebrow: '默写',
    prompt: '凭记忆把经文写下来，写完点「提交」。',
    placeholder: '在这里写经文…',
    label: '你的默写',
    submit: '提交',
    back: '再看一遍',
    perfect: '全部写对了！',
    done: '默写结果',
    accuracy: '正确率',
    right: (n: number, total: number) => `${n} / ${total} 个字写对`,
    wrong: '个错字',
    missing: '个漏字',
    extra: '个多字',
    legend: ['写对', '写错', '漏写', '多写'],
    yours: '你写的',
    wrote: (typed: string) => `你写成了「${typed}」`,
    again: '再写一次',
  },
};

export function DictationPanel({
  built,
  chinese,
  sound,
  announce,
  modeLabel,
  draft,
  onDraftChange,
  onBack,
}: DictationPanelProps) {
  const t = chinese ? TEXT.zh : TEXT.en;
  const scripture = built.fullText;
  const [result, setResult] = useState<DictationResult | null>(null);
  const [written, setWritten] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (result) resultRef.current?.focus();
    else inputRef.current?.focus();
  }, [result]);

  const submit = () => {
    if (!draft.trim()) return;
    const graded = gradeDictation(scripture, draft);
    setWritten(draft);
    setResult(graded);
    const perfect = graded.correct === graded.total && graded.extra === 0;
    if (perfect) sound.playComplete();
    announce(`${perfect ? t.perfect : t.done}. ${t.accuracy} ${pct(graded.accuracy)}%.`);
  };

  const writeAgain = () => {
    onDraftChange('');
    setResult(null);
  };

  const lookAgain = () => {
    // Once graded, the next try starts from a clean page.
    if (result) onDraftChange('');
    onBack();
  };

  const perfect = result !== null && result.correct === result.total && result.extra === 0;

  return (
    <div
      className="stage stage--fit stage--study"
      role="region"
      aria-label={`${t.eyebrow}: ${built.reference}`}
    >
      <div className="card">
        <div className="study__scroll">
          <div className="study__meta">
            <span className="eyebrow">
              {modeLabel ?? `Level ${built.level}`} · {t.eyebrow}
            </span>
          </div>

          <p className="reference" style={{ display: 'block', marginTop: 12 }}>
            {built.reference}
          </p>

          {result === null ? (
            <form
              className="dictation__form"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
              id="dictation-form"
            >
              <label className="dictation__prompt" htmlFor="dictation-input">
                {t.prompt}
              </label>
              <textarea
                id="dictation-input"
                ref={inputRef}
                className={`dictation__input scripture ${chinese ? 'dictation__input--cjk' : ''}`}
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                placeholder={t.placeholder}
                aria-label={t.label}
                lang={chinese ? 'zh-CN' : 'en'}
                rows={5}
                maxLength={scripture.length * 3 + 100}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
              />
            </form>
          ) : (
            <section className="dictation__result" role="status">
              <h2 className="dictation__done" ref={resultRef} tabIndex={-1}>
                {perfect ? t.perfect : t.done}
              </h2>
              <div className="dictation__score">
                <b>{pct(result.accuracy)}%</b>
                <span>{t.accuracy}</span>
              </div>
              <div className="guess__stats dictation__stats">
                <span>{t.right(result.correct, result.total)}</span>
                {result.wrong > 0 && <span><b>{result.wrong}</b> {t.wrong}</span>}
                {result.missing > 0 && <span><b>{result.missing}</b> {t.missing}</span>}
                {result.extra > 0 && <span><b>{result.extra}</b> {t.extra}</span>}
              </div>
              {!perfect && (
                <div className="guess__legend" aria-hidden="true">
                  {t.legend.map((label, i) =>
                    [result.correct, result.wrong, result.missing, result.extra][i] > 0 ? (
                      <span key={label} className={`dictation-mark ${LEGEND[i]}`}>{label}</span>
                    ) : null,
                  )}
                </div>
              )}
              <p className={`scripture dictation__verse ${chinese ? 'dictation__verse--cjk' : ''}`}>
                {dictationSegments(scripture, result).map((segment, i) => {
                  if (segment.kind === 'text') return <span key={i}>{segment.text}</span>;
                  if (segment.kind === 'extra') {
                    return (
                      <del key={i} className="dictation-mark dictation-mark--extra">
                        {segment.typed}
                      </del>
                    );
                  }
                  if (segment.mark === 'wrong') {
                    return (
                      <ruby key={i} className="dictation-mark dictation-mark--wrong" title={t.wrote(segment.typed)}>
                        {segment.text}
                        <rt>
                          <s>{segment.typed}</s>
                        </rt>
                      </ruby>
                    );
                  }
                  return (
                    <span key={i} className={`dictation-mark dictation-mark--${segment.mark}`}>
                      {segment.text}
                    </span>
                  );
                })}
              </p>
              <div className="dictation__yours">
                <span className="dictation__yours-label">{t.yours}</span>
                <p className="scripture">{written}</p>
              </div>
            </section>
          )}
        </div>

        <div className="divider" />

        <div className="btn-row study__actions" style={{ justifyContent: 'space-between' }}>
          <div className="btn-row" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={lookAgain}>
              {t.back}
            </button>
          </div>
          <div className="btn-row study__start">
            {result === null ? (
              <button
                type="submit"
                form="dictation-form"
                className="btn btn--primary"
                disabled={!draft.trim()}
              >
                {t.submit}
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={writeAgain}>
                {t.again}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
