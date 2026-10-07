import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SoundEngine } from '../audio/sound';
import { splitToken, tallyGuesses, type GuessGame } from '../game/guess';

interface GuessPhaseProps {
  game: GuessGame;
  reference: string;
  /** Show the screen's own words in Chinese (the passage is Chinese). */
  chinese: boolean;
  sound: SoundEngine;
  announce: (message: string, assertive?: boolean) => void;
  onPlayAgain: () => void;
  onDone: () => void;
}

const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

const TEXT = {
  en: {
    eyebrow: { words: 'Guess the Next Word', letters: 'Guess the Letters' },
    progress: {
      words: (n: number, total: number) => `Word ${n} of ${total}`,
      letters: (n: number, total: number) => `Letter ${n} of ${total}`,
    },
    prompt: { words: 'Which word comes next?', letters: 'Which letter is missing?' },
    choices: 'Choices',
    wrong: 'Not that one. Try again.',
    done: { words: 'You guessed the whole passage!', letters: 'Every word is complete!' },
    units: { words: 'words guessed', letters: 'letters guessed' },
    guesses: 'guesses',
    firstTry: (n: number, total: number) => `right on the first try (${pct(n, total)}%)`,
    legend: ['First try', 'Second try', 'Three or more'],
    given: 'Given as context',
    insight: {
      words:
        'The words before were your clues. Whatever you got on the first try was predictable from context: ' +
        'that is redundancy. Learning to make this guess is how an AI learns language.',
      letters:
        'Letters you got on the first try were predictable: that is redundancy. Claude Shannon played this ' +
        'same game and found that about half of English is.',
    },
    again: 'Play again',
    another: 'Pick another verse',
    option: (o: string) => `Choice: ${o}`,
  },
  zh: {
    eyebrow: { words: '猜下一个词', letters: '猜字' },
    progress: {
      words: (n: number, total: number) => `第 ${n} 个词，共 ${total} 个`,
      letters: (n: number, total: number) => `第 ${n} 个字，共 ${total} 个`,
    },
    prompt: { words: '根据前面的词，下一个词是什么？', letters: '这个词缺的字是什么？' },
    choices: '选项',
    wrong: '不是这个，再猜一次。',
    done: { words: '整段经文猜完了！', letters: '每个词都补全了！' },
    units: { words: '个词', letters: '个字' },
    guesses: '次猜测',
    firstTry: (n: number, total: number) => `个一次猜中（${pct(n, total)}%）`,
    legend: ['一次猜中', '猜了两次', '三次以上'],
    given: '给出的上下文',
    insight: {
      words: '前面的词就是线索。一次就猜中的词，能从上下文猜到，这就是冗余。AI 学说话，练的就是这个猜法。',
      letters: '一次就猜中的字，是你本来就能猜到的部分，这就是冗余。香农用同样的游戏，算出英文大约一半是冗余。',
    },
    again: '再猜一次',
    another: '换一节经文',
    option: (o: string) => `选项：${o}`,
  },
};

/** Colour class for a word or letter by how many tries it took. */
function heat(tries: number): string {
  if (tries <= 1) return 'guess-heat--first';
  if (tries === 2) return 'guess-heat--second';
  return 'guess-heat--more';
}

export function GuessPhase({
  game,
  reference,
  chinese,
  sound,
  announce,
  onPlayAgain,
  onDone,
}: GuessPhaseProps) {
  const t = chinese ? TEXT.zh : TEXT.en;
  const kind = game.kind;
  const [stepIndex, setStepIndex] = useState(0);
  const [unitIndex, setUnitIndex] = useState(0);
  const [tries, setTries] = useState<number[]>([]);
  const [missed, setMissed] = useState<string[]>([]);
  const [shaking, setShaking] = useState<string | null>(null);
  const shakeTimer = useRef<number | undefined>(undefined);
  const streak = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const blankRef = useRef<HTMLSpanElement>(null);
  const playRef = useRef<HTMLElement>(null);

  // Where each step's units start in the flat list of tries.
  const offsets: number[] = [];
  let totalUnits = 0;
  for (const s of game.steps) {
    offsets.push(totalUnits);
    totalUnits += s.units.length;
  }
  const complete = stepIndex >= game.steps.length;
  const step = complete ? null : game.steps[stepIndex];
  const unit = step ? step.units[unitIndex] : null;
  const shownTokens = step ? step.tokenIndex : game.tokens.length;
  const stepByToken = new Map(game.steps.map((s, i) => [s.tokenIndex, i]));
  const given = new Set(game.given);
  const tally = tallyGuesses(tries);

  useEffect(() => () => window.clearTimeout(shakeTimer.current), []);

  // Keep the word being guessed in sight, just above the choices, however long
  // the passage has grown. The choices are pinned to the bottom of the card
  // while it scrolls, so their top edge is where the readable part ends.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const blank = blankRef.current;
    const play = playRef.current;
    if (!card || !blank || !play) return;
    const overflow = blank.getBoundingClientRect().bottom - (play.getBoundingClientRect().top - 12);
    if (overflow > 0) card.scrollTop += overflow;
  }, [stepIndex]);

  const choose = (value: string) => {
    if (!step || !unit || missed.includes(value)) return;
    sound.resume();
    if (value !== unit.answer) {
      streak.current = 0;
      sound.playWrong();
      navigator.vibrate?.(35);
      setMissed((list) => [...list, value]);
      setShaking(value);
      window.clearTimeout(shakeTimer.current);
      shakeTimer.current = window.setTimeout(() => setShaking(null), 420);
      announce(t.wrong, true);
      return;
    }
    const used = missed.length + 1;
    streak.current = used === 1 ? streak.current + 1 : 1;
    setTries((list) => [...list, used]);
    setMissed([]);
    setShaking(null);
    if (unitIndex + 1 < step.units.length) {
      setUnitIndex(unitIndex + 1);
      sound.playCorrect(Math.min(streak.current, 6));
      return;
    }
    setUnitIndex(0);
    const next = stepIndex + 1;
    setStepIndex(next);
    if (next >= game.steps.length) {
      sound.playComplete();
      announce(t.done[kind], true);
    } else {
      sound.playCorrect(Math.min(streak.current, 6));
      announce(step.word);
    }
  };

  // On a laptop, 1–4 pick a choice, and typing a letter picks the choice that is that letter.
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  const unitRef = useRef(unit);
  unitRef.current = unit;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const options = unitRef.current?.options ?? [];
      const key = event.key.toLocaleLowerCase();
      const option = /^[1-9]$/.test(key)
        ? options[Number(key) - 1]
        : kind === 'letters'
          ? options.find((o) => o.toLocaleLowerCase() === key)
          : undefined;
      if (option) {
        event.preventDefault();
        chooseRef.current(option);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kind]);

  /** A guessed word or letter, coloured by its tries. */
  const colored = (text: string, n: number, letter: boolean, key: string) => (
    <span key={key} className={`${letter ? 'guess-letter' : 'guess-word'} ${heat(n)}`}>{text}</span>
  );

  const renderShown = (token: string, index: number) => {
    const s = stepByToken.get(index);
    const { lead, word, trail } = splitToken(token);
    if (s === undefined) {
      if (!given.has(index)) return <Fragment key={index}><span>{token}</span>{game.separator}</Fragment>;
      return (
        <Fragment key={index}>
          <span>{lead}<span className="guess-word guess-word--given">{word}</span>{trail}</span>
          {game.separator}
        </Fragment>
      );
    }
    const st = game.steps[s];
    const body =
      kind === 'words'
        ? colored(st.word, tries[offsets[s]], false, 'w')
        : (
          <span className="guess-word guess-word--plain">
            {st.shown}
            {st.units.map((u, i) => colored(u.answer, tries[offsets[s] + i], true, `l${i}`))}
          </span>
        );
    return <Fragment key={index}><span>{lead}{body}{trail}</span>{game.separator}</Fragment>;
  };

  const renderCurrent = () => {
    if (!step) return null;
    const { lead } = splitToken(game.tokens[step.tokenIndex]);
    if (kind === 'words') {
      return (
        <span className="guess__blank" aria-label={t.prompt.words} ref={blankRef}>
          {lead}
          <span className="guess__blank-slot">?</span>
        </span>
      );
    }
    return (
      <span className="guess__blank" aria-label={t.prompt.letters} ref={blankRef}>
        {lead}
        <span className="guess-word guess-word--current">
          {step.shown}
          {step.units.map((u, i) =>
            i < unitIndex ? (
              colored(u.answer, tries[offsets[stepIndex] + i], true, `g${i}`)
            ) : (
              <span key={`s${i}`} className={`guess__slot ${i === unitIndex ? 'guess__slot--current' : ''}`}>
                {'\u00a0'}
              </span>
            ),
          )}
        </span>
      </span>
    );
  };

  return (
    <main
      className="stage stage--fit stage--guess"
      role="region"
      aria-label={`${t.eyebrow[kind]}: ${reference}`}
    >
      <div className="card guess" ref={cardRef}>
        <div className="guess__heading">
          <div>
            <p className="eyebrow">{t.eyebrow[kind]}</p>
            <h1 className="guess__reference">{reference}</h1>
          </div>
          {!complete && (
            <span className="guess__progress">{t.progress[kind](tries.length + 1, totalUnits)}</span>
          )}
        </div>

        <p
          className={`guess__verse scripture ${chinese ? 'guess__verse--cjk' : ''}`}
          aria-label={complete ? reference : t.prompt[kind]}
        >
          {game.tokens.slice(0, shownTokens).map(renderShown)}
          {renderCurrent()}
        </p>

        {step && unit && (
          <section className="guess__play" aria-label={t.prompt[kind]} ref={playRef}>
            <p className="guess__prompt">{t.prompt[kind]}</p>
            <div
              className={`guess__options ${kind === 'letters' ? 'guess__options--letters' : ''}`}
              role="group"
              aria-label={t.choices}
            >
              {unit.options.map((option) => {
                const out = missed.includes(option);
                return (
                  <button
                    key={`${stepIndex}-${unitIndex}-${option}`}
                    type="button"
                    className={`guess-option ${out ? 'guess-option--out' : ''} ${
                      shaking === option ? 'guess-option--wrong' : ''
                    }`}
                    onClick={() => choose(option)}
                    disabled={out}
                    aria-label={t.option(option)}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {complete && (
          <section className="guess__summary" role="status">
            <strong className="guess__done">{t.done[kind]}</strong>
            <div className="guess__stats">
              <span><b>{tally.units}</b> {t.units[kind]}</span>
              <span><b>{tally.guesses}</b> {t.guesses}</span>
              <span><b>{tally.firstTry}</b> {t.firstTry(tally.firstTry, tally.units)}</span>
            </div>
            <div className="guess__legend" aria-hidden="true">
              {t.legend.map((label, i) => (
                <span key={label} className={`guess-word ${heat(i + 1)}`}>{label}</span>
              ))}
              {kind === 'words' && game.given.length > 0 && (
                <span className="guess-word guess-word--given">{t.given}</span>
              )}
            </div>
            <p className="guess__insight">{t.insight[kind]}</p>
            <div className="btn-row">
              <button type="button" className="btn btn--primary" onClick={onPlayAgain}>
                {t.again}
              </button>
              <button type="button" className="btn btn--ghost" onClick={onDone}>
                {t.another}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
