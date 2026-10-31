import { build } from 'esbuild';
import { mkdirSync, copyFileSync, cpSync } from 'node:fs';
await build({ stdin: { contents: "export { unzipSync, strFromU8 } from 'fflate';", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'external', outfile: 'assets/document-archive.js' });
mkdirSync('assets/pdf', { recursive: true });
for (const file of ['pdf', 'pdf.worker']) copyFileSync(`node_modules/pdfjs-dist/build/${file}.min.mjs`, `assets/pdf/${file}.mjs`);
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) cpSync(`node_modules/pdfjs-dist/${directory}`, `assets/pdf/${directory}`, { recursive: true });
copyFileSync('node_modules/pdfjs-dist/LICENSE', 'assets/pdf/LICENSE');
