#!/usr/bin/env python3
"""Render the six-note "correct" scale into public/audio (public domain, ours).

These files reproduce the original Web Audio A-major pentatonic cue: a warm
sine note plus a quiet octave, with the same attack and decay. Separate files
preserve equal duration and timbre while using reliable HTMLAudioElement
playback on mobile Safari.
"""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[1] / "public" / "audio"
SR = 44100
TOTAL_DURATION = 0.34
ATTACK = 0.012
MASTER = 0.9
OUTPUT_GAIN = 1.5
SCALE = [440.0, 554.37, 659.25, 739.99, 880.0, 1108.73]


def exponential_envelope(t: float, peak: float, end: float) -> float:
    """Match Web Audio's exponential ramps from 0.0001 → peak → 0.0001."""
    floor = 0.0001
    if t < 0 or t > end:
        return 0.0
    if t < ATTACK:
        return floor * ((peak / floor) ** (t / ATTACK))
    return peak * ((floor / peak) ** ((t - ATTACK) / (end - ATTACK)))


def render(frequency: float, output: Path) -> None:
    n = int(SR * TOTAL_DURATION)
    frames = []
    for i in range(n):
        t = i / SR
        fundamental = (
            math.sin(2 * math.pi * frequency * t)
            * exponential_envelope(t, 0.2, 0.32)
        )
        octave = (
            math.sin(2 * math.pi * frequency * 2 * t)
            * exponential_envelope(t, 0.05, 0.28)
        )
        sample = max(
            -1.0,
            min(1.0, (fundamental + octave) * MASTER * OUTPUT_GAIN),
        )
        frames.append(struct.pack("<h", int(sample * 32767)))

    with wave.open(str(output), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(frames))


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for index, frequency in enumerate(SCALE, start=1):
        filename = "correct.wav" if index == 1 else f"correct-{index}.wav"
        output = OUT_DIR / filename
        render(frequency, output)
        print(f"Wrote {output} ({frequency:.2f} Hz)")


if __name__ == "__main__":
    main()
