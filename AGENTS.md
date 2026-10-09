# Bible narration

After adding or changing curated passages in `data/verses.json`, or changing their CUV text in `public/cuv/`, run `python3 scripts/fangfang_narration.py status`. This updates `data/narration-cuv-fangfang.json`, marking new verses as missing and changed verses for rerecording. It does not generate audio or upload files.

Read `docs/NARRATION.md` when generating, checking, packaging, or publishing Fangfang narration. Keep voice references and WAV masters outside Git; publish only checked or owner-reviewed MP3s and their catalog under `public/audio/cuv-fangfang/`. Owner audition approval must refer to the exact current take; never infer approval for a new or replaced recording. Mark recordings as published only after verifying their public files.

# WEB narration

After adding or changing curated passages, also run `python3 scripts/web_narration.py status`. Read `docs/WEB-NARRATION.md` before generating, checking, packaging, or publishing Louise WEB narration. Use the bundled public-domain WEB Classic text, the existing authorized Louise English profile, and `public/audio/web-louise/` for checked or explicitly owner-reviewed MP3s. Keep English owner review separate from CUV review; mark published only after public verification.
