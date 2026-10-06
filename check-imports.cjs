const fs = require('fs');
const path = require('path');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

const files = walk('src');
let found = false;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  // Match bare "useEffect(" but not ".useEffect(" (e.g. React.useEffect)
  const bareUseEffect = /(?<![.\w])useEffect\s*\(/.test(content);
  if (!bareUseEffect) continue;

  const importLine = content.split('\n').find(
    (l) => (l.includes("from 'react'") || l.includes('from "react"')) && l.trim().startsWith('import')
  );
  const hasNamedImport = importLine && /\{[^}]*\buseEffect\b[^}]*\}/.test(importLine);

  if (!hasNamedImport) {
    found = true;
    console.log('MISSING useEffect import:', file);
    console.log('  current import line:', importLine || '(none found)');
  }
}

if (!found) console.log('No missing useEffect imports found.');