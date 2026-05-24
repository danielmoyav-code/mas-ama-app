#!/usr/bin/env node
// QA Static Check — verifica patrones críticos en app.js y Code.gs
// Falla CI si detecta bugs conocidos (UTC dates, console.log accidentales, etc.)
const fs = require('fs');
const path = require('path');

const checks = [
  {
    name: 'No new Date("YYYY-MM-DD") (UTC bug)',
    file: 'app.js',
    pattern: /new Date\(['"]\d{4}-\d{2}-\d{2}['"]\)/g,
    allowedCount: 0,
  },
  {
    name: 'No toISOString().split UTC bug',
    file: 'app.js',
    pattern: /\.toISOString\(\)\.split\(['"]T['"]\)/g,
    allowedCount: 0,
  },
  {
    name: 'No toISOString().slice() para fechas locales (usar todayISO/monthISO)',
    file: 'app.js',
    pattern: /new Date\(\)\.toISOString\(\)\.slice\(/g,
    allowedCount: 0,
  },
  {
    name: 'parseDateLocal definido',
    file: 'app.js',
    pattern: /function parseDateLocal/g,
    minCount: 1,
  },
  {
    name: 'refreshEmpam definido',
    file: 'app.js',
    pattern: /function refreshEmpam/g,
    minCount: 1,
  },
  {
    name: 'Code.gs usa Santiago timezone',
    file: 'Code.gs',
    pattern: /America\/Santiago/g,
    minCount: 5,
  },
  {
    name: 'No console.log() en producción (debe usar console.warn/error)',
    file: 'app.js',
    pattern: /\bconsole\.log\(/g,
    allowedCount: 0,
  },
];

let failed = 0;
console.log('\nMAS AMA — QA Static Check\n' + '='.repeat(40));

for (const check of checks) {
  const filePath = path.join(__dirname, '..', check.file);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP  ${check.name}: archivo no existe ${check.file}`);
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const matches = content.match(check.pattern) || [];
  const count = matches.length;

  if (check.allowedCount !== undefined && count > check.allowedCount) {
    console.log(`FAIL  ${check.name}`);
    console.log(`      Encontrado ${count}, esperado <= ${check.allowedCount}`);
    failed++;
  } else if (check.minCount !== undefined && count < check.minCount) {
    console.log(`FAIL  ${check.name}`);
    console.log(`      Encontrado ${count}, esperado >= ${check.minCount}`);
    failed++;
  } else {
    console.log(`PASS  ${check.name} (count=${count})`);
  }
}

console.log('='.repeat(40));
if (failed > 0) {
  console.log(`\n❌ ${failed} verificaciones fallaron\n`);
  process.exit(1);
}
console.log('\n✅ Todas las verificaciones pasaron\n');
