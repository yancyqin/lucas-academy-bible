#!/usr/bin/env python3
"""Synthesize the "correct" chime → public/audio/correct.wav (public domain, ours).

A soft bell-like ding. It is played through an HTMLAudioElement (like the damage
cue) so mobile Safari plays it reliably even when the Web Audio context is
suspended by speech synthesis. Re-run to tweak:  python3 scripts/build_correct_cue.py
"""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public" / "audio" / "correct.wav"
SR = 44100
DUR = 0.32
F0 = 784.0  # G5 — bright but gentle

# (partial ratio, amplitude) — a slightly inharmonic 3rd partial adds shimmer.
PARTIALS = [(1.0, 0.7), (2.0, 0.26), (3.01, 0.11)]


def main() -> None:
    n = int(SR * DUR)
    samples = []
    peak = 0.0
    raw = []
    for i in range(n):
        t = i / SR
        # 4 ms attack, exponential decay (~110 ms).
        attack = min(1.0, t / 0.004)
        env = attack * math.exp(-t / 0.11)
        s = sum(a * math.sin(2 * math.pi * F0 * r * t) for r, a in PARTIALS) * env
        raw.append(s)
        peak = max(peak, abs(s))

    gain = 0.62 / peak if peak else 0.0
    for s in raw:
        v = int(max(-1.0, min(1.0, s * gain)) * 32767)
        samples.append(struct.pack("<h", v))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(samples))
    print(f"Wrote {OUT} ({n} frames, {DUR}s)")


if __name__ == "__main__":
    main()
