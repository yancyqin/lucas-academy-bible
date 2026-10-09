import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv, type Plugin } from 'vite';

/** Keep online narration and its catalog out of self-contained distributions. */
export function narrationBuild(): Plugin {
  let offline = false;
  let outDir = '';
  const emptyCatalog = '\0offline-narration';
  const editions = ['cuv-fangfang', 'web-louise'];
  return {
    name: 'scripture-narration-distribution',
    enforce: 'pre',
    configResolved(config) {
      const env = { ...loadEnv(config.mode, config.envDir, 'VITE_'), ...process.env };
      const target = env.VITE_DIST_TARGET;
      offline = target === 'ios' || target === 'itch' || (!target && env.VITE_ITCH_BUILD === 'true');
      outDir = resolve(config.root, config.build.outDir);
    },
    resolveId(source) {
      if (offline && editions.some((edition) => source.endsWith(`/data/narration-${edition}-release.json`))) return emptyCatalog;
    },
    load(id) {
      if (id === emptyCatalog) return 'export default { enabled: false, clips: [] };';
    },
    closeBundle() {
      if (offline) editions.forEach((edition) => rmSync(resolve(outDir, `audio/${edition}`), { recursive: true, force: true }));
    },
  };
}
