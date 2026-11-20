// Сборка в один HTML-файл (открывается двойным кликом, без сервера).
// node tools/build.mjs  → dist/index.html
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const res = await build({ entryPoints: ['js/main.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020' });
const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const css = readFileSync('css/style.css', 'utf8');
let html = readFileSync('index.html', 'utf8')
  .replace('<link rel="stylesheet" href="css/style.css">', `<style>${css}</style>`)
  .replace('<script type="module" src="js/main.js"></script>', () => `<script>${js}</script>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log('dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
