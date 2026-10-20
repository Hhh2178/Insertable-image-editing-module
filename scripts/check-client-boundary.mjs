import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const result = await build({
  entryPoints: [resolve('src/react/index.ts')],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  outfile: resolve('artifacts/client-boundary.js'),
  write: false,
  metafile: true,
  external: ['react', 'react-dom'],
});
const inputs = Object.keys(result.metafile.inputs).join('\n').toLowerCase();
assert.doesNotMatch(inputs, /src[\\/]server|src[\\/]adapters|sharp|node:/, 'browser entry must not pull Node/server/provider modules');
assert.match(inputs, /src[\\/]react[\\/]imageeditordialog\.tsx/i);
assert.match(inputs, /src[\\/]core[\\/]image-coordinates\.ts/i);
process.stdout.write(`Client boundary passed (${Object.keys(result.metafile.inputs).length} inputs; no server, Sharp, or APIMart modules).\n`);
