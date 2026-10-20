import assert from 'node:assert/strict';
import test from 'node:test';
import { REQUIRED_FILES, validateHarnessSnapshot } from './check_harness.mjs';

function fixture() {
  const files = new Map(REQUIRED_FILES.map((file) => [file, '# Fixture\n']));
  files.set('package.json', JSON.stringify({ scripts: {
    'harness:check': 'node scripts/check_harness.mjs',
    'harness:test': 'node --test scripts/check_harness.test.mjs',
    test: 'npm run test:core && npm run test:ui && npm run test:server && npm run test:adapter && npm run test:guidance && npm run test:boundary',
    'test:guidance': 'node --import tsx --test tests/guidance/*.test.ts',
    'test:boundary': 'node scripts/check-client-boundary.mjs && node --test scripts/check-client-boundary.test.mjs',
    build: 'tsc --noEmit && vite build && npm run build:module',
    example: 'tsx examples/react-express/server.ts',
  }, exports: {
    '.': { import: './dist/module/core/index.js' },
    './core': { import: './dist/module/core/index.js' },
    './react': { import: './dist/module/react/index.js' },
    './server': { import: './dist/module/server/index.js' },
    './adapters/apimart': { import: './dist/module/adapters/apimart/index.js' },
    './guidance': { import: './dist/module/guidance/index.js' },
    './guidance/react': { import: './dist/module/guidance/react/index.js' },
    './guidance/server': { import: './dist/module/guidance/server-index.js' },
  } }));
  files.set('.gitignore', '.env\n.env.*\n!.env.example\nnode_modules/\ndist/\n');
  files.set('README.md', '[状态](liran_docs/04-开发追踪.md)\n');
  files.set('liran_docs/03-索引.md', '[入口](../README.md)\n');
  return files;
}

test('valid independent Harness snapshot passes', () => {
  assert.deepEqual(validateHarnessSnapshot(fixture()), []);
});

test('Harness requires the optional guidance module public entries', () => {
  for (const path of ['src/guidance/index.ts', 'src/guidance/server-index.ts', 'src/guidance/react/index.ts']) {
    assert.ok(REQUIRED_FILES.includes(path), `Harness must require ${path}`);
  }
});

test('Harness includes regression tests for both browser module entries', () => {
  assert.ok(REQUIRED_FILES.includes('scripts/check-client-boundary.test.mjs'));
});

test('missing required document fails', () => {
  const files = fixture();
  files.delete('liran_docs/04-开发追踪.md');
  assert.ok(validateHarnessSnapshot(files).some((issue) => issue.includes('Missing required file')));
});

test('broken internal link fails', () => {
  const files = fixture();
  files.set('README.md', '[missing](liran_docs/missing.md)');
  assert.ok(validateHarnessSnapshot(files).some((issue) => issue.includes('Broken internal link')));
});

test('a local link escaping the repository fails', () => {
  const files = fixture();
  files.set('README.md', '[parent](../other-project/README.md)');
  assert.ok(validateHarnessSnapshot(files).some((issue) => issue.includes('outside repository')));
});

test('development-machine absolute paths fail', () => {
  const files = fixture();
  files.set('README.md', 'Read C:/local-machine/project/README.md');
  assert.ok(validateHarnessSnapshot(files).some((issue) => issue.includes('Absolute machine path')));
});

test('command drift fails', () => {
  const files = fixture();
  files.set('package.json', JSON.stringify({ scripts: { 'harness:check': 'node wrong.mjs' } }));
  assert.ok(validateHarnessSnapshot(files).some((issue) => issue.includes('Command mismatch')));
});

test('an incomplete public module export fails', () => {
  const files = fixture();
  const manifest = JSON.parse(files.get('package.json'));
  delete manifest.exports['./react'];
  files.set('package.json', JSON.stringify(manifest));
  assert.ok(validateHarnessSnapshot(files).some((issue) => issue.includes('Export mismatch: ./react')));
});

test('missing credential-ignore rule fails', () => {
  const files = fixture();
  files.set('.gitignore', 'node_modules/\ndist/\n');
  assert.ok(validateHarnessSnapshot(files).some((issue) => issue.includes('Missing ignore rule')));
});

test('external provenance links do not require parent checkout files', () => {
  const files = fixture();
  files.set('README.md', '[source](https://github.com/example/source/commit/123)');
  assert.deepEqual(validateHarnessSnapshot(files), []);
});
