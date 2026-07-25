import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';

const root = process.cwd();
const distDirectory = resolve(root, 'dist');
const serverDirectory = resolve(distDirectory, 'server');
const metadataDirectory = resolve(distDirectory, '.openai');
const workerSource = resolve(root, 'worker', 'index.js');
const hostingSource = resolve(root, '.openai', 'hosting.json');

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === 'server' || entry.name === '.openai') continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile()) files.push(path);
  }

  return files;
}

const assetFiles = await listFiles(distDirectory);
const embeddedAssets = await Promise.all(
  assetFiles.map(async (path) => {
    const webPath = `/${relative(distDirectory, path).split(sep).join('/')}`;
    const bytes = await readFile(path);
    return [
      webPath,
      {
        body: bytes.toString('base64'),
        contentType: CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
      },
    ];
  }),
);

const workerTemplate = await readFile(workerSource, 'utf8');
const workerBundle = workerTemplate.replace(
  '/* __STATIC_ASSETS__ */',
  JSON.stringify(embeddedAssets),
);

await mkdir(serverDirectory, { recursive: true });
await writeFile(resolve(serverDirectory, 'index.js'), workerBundle, 'utf8');

if (await exists(hostingSource)) {
  await mkdir(metadataDirectory, { recursive: true });
  await writeFile(
    resolve(metadataDirectory, 'hosting.json'),
    await readFile(hostingSource),
  );
}
