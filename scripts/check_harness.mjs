import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_FILES = [
  'AGENTS.md', 'README.md', '.gitignore', 'package.json',
  'src/core/index.ts', 'src/react/index.ts', 'src/server/index.ts', 'src/adapters/apimart/index.ts',
  'src/guidance/index.ts', 'src/guidance/server-index.ts', 'src/guidance/react/index.ts',
  'src/react/editor.css', 'examples/react-express/server.ts', 'public/sample-product.svg',
  'tests/core/prompt-validation.test.ts', 'tests/react/ImageEditorDialog.test.tsx',
  'tests/server/edit-image.test.ts', 'tests/adapters/apimart.test.ts',
  'tests/guidance/contracts.test.ts', 'tests/guidance/service.test.ts',
  'scripts/check_harness.mjs', 'scripts/check_harness.test.mjs',
  'scripts/check-client-boundary.mjs', 'scripts/copy-module-assets.mjs',
  'scripts/check-client-boundary.test.mjs',
  'liran_docs/03-索引.md', 'liran_docs/04-开发追踪.md',
  'liran_docs/02-架构方案.md', 'liran_docs/用户原话.md',
  'liran_docs/requirements/IMAGE-EDITOR-MODULE-20261019-01-需求整理.md',
  'liran_docs/requirements/IMAGE-EDITOR-MODULE-20261019-01-PRD.md',
  'liran_docs/requirements/IMAGE-EDITOR-MODULE-20261019-01-流程评分.md',
  'liran_docs/plans/IMAGE-EDITOR-MODULE-20261019-01-实施方案.md',
  'liran_docs/modules/IMAGE-EDITOR-MODULE-20261019-01-模块拆解.md',
  'liran_docs/guides/接入指南.md',
  'liran_docs/08-测试用例.md', 'liran_docs/09-真机实测.md',
  'liran_docs/logbooks/2026-10-19-初始化记录.md',
  'liran_docs/validations/2026-10-19-模块实现验证.md',
  'liran_docs/validations/2026-10-19-Harness验证.md',
  'liran_docs/validations/IMAGE-EDITOR-MODULE-20261019-01-PRD转换审计.md',
  'liran_docs/requirements/IMAGE-ITERATION-20261020-01-PRD.md',
  'liran_docs/plans/IMAGE-ITERATION-20261020-01-实施方案.md',
  'liran_docs/modules/IMAGE-ITERATION-20261020-01-模块拆解.md',
  'liran_docs/ui-shells/IMAGE-ITERATION-20261020-01-UI壳验收.md',
];

const COMMANDS = {
  'harness:check': 'node scripts/check_harness.mjs',
  'harness:test': 'node --test scripts/check_harness.test.mjs',
  test: 'npm run test:core && npm run test:ui && npm run test:server && npm run test:adapter && npm run test:guidance && npm run test:boundary',
  'test:guidance': 'node --import tsx --test tests/guidance/*.test.ts',
  'test:boundary': 'node scripts/check-client-boundary.mjs && node --test scripts/check-client-boundary.test.mjs',
  build: 'tsc --noEmit && vite build && npm run build:module',
  example: 'tsx examples/react-express/server.ts',
};

const EXPORTS = {
  '.': './dist/module/core/index.js',
  './core': './dist/module/core/index.js',
  './react': './dist/module/react/index.js',
  './server': './dist/module/server/index.js',
  './adapters/apimart': './dist/module/adapters/apimart/index.js',
  './guidance': './dist/module/guidance/index.js',
  './guidance/react': './dist/module/guidance/react/index.js',
  './guidance/server': './dist/module/guidance/server-index.js',
};

/** Pure snapshot validation keeps negative tests in memory and never opens credential files. */
export function validateHarnessSnapshot(files) {
  const issues = [];
  for (const file of REQUIRED_FILES) {
    if (!files.has(file) || !files.get(file).trim()) issues.push(`Missing required file: ${file}`);
  }
  let manifest;
  try { manifest = JSON.parse(files.get('package.json') || '{}'); }
  catch { issues.push('Invalid package.json'); }
  for (const [name, command] of Object.entries(COMMANDS)) {
    if (manifest?.scripts?.[name] !== command) issues.push(`Command mismatch: ${name}`);
  }
  for (const [name, target] of Object.entries(EXPORTS)) {
    if (manifest?.exports?.[name]?.import !== target) issues.push(`Export mismatch: ${name}`);
  }
  const ignores = new Set((files.get('.gitignore') || '').split(/\r?\n/).map((line) => line.trim()));
  for (const rule of ['.env', '.env.*', '!.env.example', 'node_modules/', 'dist/']) {
    if (!ignores.has(rule)) issues.push(`Missing ignore rule: ${rule}`);
  }

  for (const [file, content] of files) {
    if (!file.endsWith('.md')) continue;
    if (/\b[A-Za-z]:[\\/]|\/(?:Users|home)\//.test(content)) issues.push(`Absolute machine path: ${file}`);
    const links = content.matchAll(/!?\[[^\]]*\]\((?:<([^>]+)>|([^)]+))\)/g);
    for (const match of links) {
      const link = (match[1] || match[2]).trim();
      if (/^(?:https?:|mailto:|#)/i.test(link)) continue;
      let target;
      try { target = decodeURIComponent(link.split(/[?#]/)[0]); }
      catch { issues.push(`Invalid link encoding: ${file}`); continue; }
      if (!target) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
      if (target.startsWith('/') || /^[A-Za-z]:/.test(target) || resolved === '..' || resolved.startsWith('../')) {
        issues.push(`Link outside repository: ${file}`);
      } else if (!files.has(resolved)) {
        issues.push(`Broken internal link: ${file} -> ${resolved}`);
      }
    }
  }
  return issues;
}

function readSnapshot(root) {
  const files = new Map();
  const add = (relative) => {
    const absolute = path.join(root, relative);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) files.set(relative, fs.readFileSync(absolute, 'utf8'));
  };
  for (const file of REQUIRED_FILES) add(file);
  const visit = (relative) => {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return;
    for (const item of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.posix.join(relative, item.name);
      if (item.isDirectory()) visit(child);
      else if (item.isFile() && item.name.endsWith('.md')) add(child);
    }
  };
  visit('liran_docs');
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = readSnapshot(root);
  const issues = validateHarnessSnapshot(files);
  if (issues.length) {
    console.error(`Harness check failed with ${issues.length} issue(s):\n${issues.map((item) => `- ${item}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`Harness check passed: ${REQUIRED_FILES.length} required files, ${[...files.keys()].filter((file) => file.endsWith('.md')).length} Markdown documents.`);
  }
}
