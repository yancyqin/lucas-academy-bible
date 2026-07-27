import { useEffect, useRef, useState } from 'react';
import type { SoundEngine } from '../audio/sound';
import { downloadCertificate } from '../game/certificate';
import { BookMark, DownloadIcon } from './icons';

interface FinalCelebrationProps {
  pass: boolean;
  /** Highest level fully passed; null if the player cleared none. */
  certLevel: number | null;
  clearedCount: number;
  scorePercent: number;
  reference: string;
  soundEnabled: boolean;
  sound: SoundEngine;
  onPlayAgain: () => void;
  onHome: () => void;
}

export function FinalCelebration({
  pass,
  certLevel,
  clearedCount,
  scorePercent,
  reference,
  soundEnabled,
  sound,
  onPlayAgain,
  onHome,
}: FinalCelebrationProps) {
  const played = useRef(false);
  const [awarded] = useState(() => {
    const d = new Date();
    const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${date} · ${time}`;
  });

  const hasCert = certLevel !== null;

  useEffect(() => {
    if (played.current) return;
    played.current = true;
    if (!soundEnabled) return;
    sound.resume();
    if (pass) sound.playFinale();
    else if (hasCert) sound.playComplete();
  }, [soundEnabled, pass, hasCert, sound]);

  // Cleared nothing (failed the very first level) — no certificate to award.
  if (!hasCert) {
    return (
      <div className="stage stage--fit" role="region" aria-label="Run over">
        <div className="card center-col">
          <div style={{ width: 64, height: 64 }} aria-hidden="true">
            <BookMark />
          </div>
          <p className="eyebrow">Out of hearts</p>
          <h1 className="title-xl" style={{ fontSize: 'clamp(1.8rem, 6vw, 2.6rem)' }}>
            So close — try again!
          </h1>
          <p className="lede" style={{ textAlign: 'center' }}>
            Clear a level to earn your certificate. Every run starts fresh at Level 0.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={onPlayAgain}>
              Play again
            </button>
            <button type="button" className="btn btn--ghost" onClick={onHome}>
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const levelWord = clearedCount === 1 ? 'level' : 'levels';

  return (
    <div className="stage stage--fit" role="region" aria-label="Certificate">
      <div className={`card certificate center-col ${pass ? 'certificate--gold' : ''}`}>
        <div className="cert__seal" aria-hidden="true">
          <div style={{ width: 46, height: 46 }}>
            <BookMark />
          </div>
        </div>

        <p className="cert__kicker">Lucas Academy · Bible Sequence</p>
        <h1 className="cert__title">Certificate of Scripture Memory</h1>

        {pass && <p className="verdict verdict--pass">Full challenge complete</p>}

        <p className="cert__awarded-to">This certifies that you passed</p>
        <p className="cert__level">Level {certLevel}</p>

        <div className="score" role="img" aria-label={`Score ${scorePercent} percent of hearts kept`}>
          <div className="score__bar">
            <div className="score__fill" style={{ width: `${scorePercent}%` }} />
          </div>
          <div className="score__label">
            {scorePercent}% hearts kept · {clearedCount} {levelWord} cleared
          </div>
        </div>

        <p className="cert__body">
          Having studied and restored the Word of God through{' '}
          <strong>Level {certLevel}</strong> of Bible Sequence
          {reference ? (
            <>
              {' '}— up to <em>{reference}</em>
            </>
          ) : null}
          .
        </p>

        <div className="cert__rule" aria-hidden="true" />
        <div className="cert__meta">
          <span>
            <span className="cert__meta-label">Awarded</span>
            <span className="cert__meta-value">{awarded}</span>
          </span>
          <span style={{ textAlign: 'right' }}>
            <span className="cert__meta-label">Issued by</span>
            <span className="cert__meta-value cert__sig">Lucas Academy</span>
          </span>
        </div>

        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={onPlayAgain}>
            Play again
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() =>
              downloadCertificate({
                pass,
                certLevel: certLevel as number,
                clearedCount,
                scorePercent,
                reference,
                awarded,
              })
            }
          >
            <span aria-hidden="true" style={{ display: 'inline-flex' }}>
              <DownloadIcon />
            </span>
            Download
          </button>
          <button type="button" className="btn btn--ghost" onClick={onHome}>
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
