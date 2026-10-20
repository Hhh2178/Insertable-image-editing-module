import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function inspectClientBoundary() {
  const entries = [resolve('src/react/index.ts'), resolve('src/guidance/react/index.ts')];
  const inputSets = await Promise.all(entries.map(async (entry) => {
    const result = await build({
      entryPoints: [entry], bundle: true, platform: 'browser', format: 'esm',
      outfile: resolve('artifacts/client-boundary.js'), write: false, metafile: true,
      external: ['react', 'react-dom'],
    });
    return Object.keys(result.metafile.inputs);
  }));
  const inputs = [...new Set(inputSets.flat())];
  const joined = inputs.join('\n').toLowerCase();
  assert.doesNotMatch(joined, /src[\\/]server|src[\\/]adapters|sharp|node:/, 'browser entry must not pull Node/server/provider modules');
  assert.match(joined, /src[\\/]react[\\/]imageeditordialog\.tsx/i);
  assert.match(joined, /src[\\/]core[\\/]image-coordinates\.ts/i);
  assert.match(joined, /src[\\/]guidance[\\/]react[\\/]index\.ts/i);
  return inputs;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputs = await inspectClientBoundary();
  process.stdout.write(`Client boundary passed (${inputs.length} inputs; no server, Sharp, or APIMart modules).\n`);
}
