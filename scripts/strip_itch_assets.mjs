import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

// The itch build is intentionally WEB-only. CUV is public domain, but its
// per-book files are only needed by the Cloudflare Daily Verse Worker.
const itchCuvDirectory = resolve('dist-itch', 'cuv');
await rm(itchCuvDirectory, { recursive: true, force: true });
