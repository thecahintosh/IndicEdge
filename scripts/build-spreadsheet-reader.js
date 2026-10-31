import { build } from 'esbuild';
await build({ entryPoints: ['scripts/spreadsheet-worker-entry.js'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'external', outfile: 'assets/spreadsheet-worker.js' });
