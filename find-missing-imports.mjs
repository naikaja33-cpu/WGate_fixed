#!/usr/bin/env node
/**
 * Finds names that are USED but never imported or defined in the same file.
 * This is the "ReferenceError: useEffect is not defined" class of bug, which
 * `npm run build` and your current ESLint setup do not catch.
 *
 * Run from the project root:   node find-missing-imports.mjs
 *
 * Checks, for every .js/.jsx file under src/:
 *   - React hooks and other use* functions that are called
 *   - JSX components used as <Name ...>
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'src');
if (!fs.existsSync(root)) {
  console.error('Run this from the project root (src/ not found).');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Replace comments and string/template literal contents with spaces (keeping
// newlines) so line numbers stay correct and we don't match inside text.
function blank(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && n === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2; continue;
    }
    if (c === '"' || c === "'") {
      const q = c; out += q; i++;
      while (i < src.length && src[i] !== q && src[i] !== '\n') { if (src[i] === '\\') { out += ' '; i++; } out += ' '; i++; }
      out += q; i++; continue;
    }
    if (c === '`') {
      out += c; i++;
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '$' && src[i + 1] === '{') { // keep expressions inside ${ }
          out += '${'; i += 2; let depth = 1;
          while (i < src.length && depth) { if (src[i] === '{') depth++; if (src[i] === '}') depth--; out += src[i]; i++; }
          continue;
        }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      out += c; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

const GLOBALS = new Set(['React', 'Fragment']);
const problems = [];

for (const file of walk(root)) {
  const original = fs.readFileSync(file, 'utf8');
  const code = blank(original);

  // everything this file brings in or declares itself
  const known = new Set(GLOBALS);
  for (const m of original.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/gm)) {
    const clause = m[1];
    const def = clause.match(/^([A-Za-z_$][\w$]*)/);
    if (def && !clause.startsWith('{') && !clause.startsWith('*')) known.add(def[1]);
    const ns = clause.match(/\*\s+as\s+([\w$]+)/); if (ns) known.add(ns[1]);
    const br = clause.match(/\{([\s\S]*?)\}/);
    if (br) br[1].split(',').forEach((x) => { const n = x.trim().split(/\s+as\s+/).pop(); if (n) known.add(n); });
  }
  for (const m of code.matchAll(/\b(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) known.add(m[1]);
  // parameter lists and destructuring: ({ a, icon: Icon, b = 1 }) / [x, y] / plain names
  const addNames = (list) => list.replace(/[{}[\]()]/g, ',').split(',').forEach((part) => {
    const name = part.trim().split(':').pop().trim().replace(/\s*=.*$/, '').replace(/^\.\.\./, '').trim();
    if (/^[A-Za-z_$][\w$]*$/.test(name)) known.add(name);
  });
  for (const m of code.matchAll(/\bfunction\s*[\w$]*\s*\(((?:[^()]|\([^()]*\))*)\)/g)) addNames(m[1]);
  for (const m of code.matchAll(/\(((?:[^()]|\([^()]*\))*)\)\s*=>/g)) addNames(m[1]);
  for (const m of code.matchAll(/\b(?:const|let|var)\s*([{[][^=]*?[}\]])\s*=/g)) addNames(m[1]);
  for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*=>/g)) known.add(m[1]);

  const lines = code.split('\n');
  const report = (name, lineIdx, kind) => problems.push({ file: path.relative(process.cwd(), file), line: lineIdx + 1, name, kind });
  lines.forEach((line, idx) => {
    // hooks / use* functions that are called
    for (const m of line.matchAll(/(?<![.\w$])(use[A-Z][\w$]*)\s*\(/g)) {
      if (!known.has(m[1])) report(m[1], idx, 'function');
    }
    // JSX components
    for (const m of line.matchAll(/<([A-Z][\w$]*)(?=[\s/>.])/g)) {
      if (!known.has(m[1])) report(m[1], idx, 'component');
    }
  });
}

if (!problems.length) {
  console.log('No missing imports found.');
  process.exit(0);
}
const seen = new Set();
console.log('Used but not imported or defined:\n');
for (const p of problems) {
  const key = `${p.file}:${p.name}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`  ${p.file}:${p.line}  ${p.name}  (${p.kind})`);
}
console.log(`\n${seen.size} problem(s). Add the missing name to that file's import line.`);
process.exit(1);