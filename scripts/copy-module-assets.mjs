import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const source = resolve(root, 'src/react/editor.css');
const destination = resolve(root, 'dist/module/react/editor.css');
await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
