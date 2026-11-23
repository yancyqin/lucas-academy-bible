import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

// The itch build is intentionally the WEB Challenge only: no Pick a Verse, so
// the bundled per-book editions (public/web, public/cuv) are dead weight there.
for (const directory of ['web', 'cuv']) {
  await rm(resolve('dist-itch', directory), { recursive: true, force: true });
}
