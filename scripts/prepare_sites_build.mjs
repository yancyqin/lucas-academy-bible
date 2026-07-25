import { access, copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const distDirectory = resolve(root, 'dist');
const serverDirectory = resolve(distDirectory, 'server');
const metadataDirectory = resolve(distDirectory, '.openai');
const workerSource = resolve(root, 'worker', 'index.js');
const hostingSource = resolve(root, '.openai', 'hosting.json');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

await mkdir(serverDirectory, { recursive: true });
await copyFile(workerSource, resolve(serverDirectory, 'index.js'));

if (await exists(hostingSource)) {
  await mkdir(metadataDirectory, { recursive: true });
  await copyFile(hostingSource, resolve(metadataDirectory, 'hosting.json'));
}
