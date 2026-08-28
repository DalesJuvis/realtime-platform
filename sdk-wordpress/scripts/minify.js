#!/usr/bin/env node
/**
 * Minifies assets/js/*.js into sibling *.min.js files with terser. Run via
 * `npm run build` (or `npm run minify`) whenever a source file under
 * assets/js/ changes — the *.min.js files are committed, not generated at
 * WordPress runtime, so this must be re-run and its output re-committed
 * before a release/tag.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const JS_DIR = path.join(__dirname, '..', 'assets', 'js');
const FILES = ['mio-protocol.js', 'mio-client.js', 'mio-shortcode.js', 'mio-embed.js'];

async function main() {
  for (const file of FILES) {
    const srcPath = path.join(JS_DIR, file);
    const outPath = path.join(JS_DIR, file.replace(/\.js$/, '.min.js'));
    const source = fs.readFileSync(srcPath, 'utf8');

    const result = await minify(source, {
      compress: true,
      mangle: true, // local/inner names only — terser's toplevel mangling stays off by default, so the UMD globals (window.MioProtocol etc.) this file assigns to are untouched
      format: { comments: false },
    });

    if (result.error) throw result.error;

    const banner = `/*! ${file} — minified build, see ${file} in this same directory for the documented source */\n`;
    fs.writeFileSync(outPath, banner + result.code + '\n');

    const savings = Math.round((1 - Buffer.byteLength(result.code) / Buffer.byteLength(source)) * 100);
    console.log(`${file} -> ${path.basename(outPath)} (${savings}% smaller)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
