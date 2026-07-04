import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const version = process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || String(Date.now());
const payload = {
  version,
  builtAt: new Date().toISOString(),
};

mkdirSync('public', { recursive: true });
writeFileSync(join('public', 'version.json'), `${JSON.stringify(payload, null, 2)}\n`);
