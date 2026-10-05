// Local timing for the Training Matrix workbook path.
// Usage: node scripts/measure-matrix-import.mjs <path-to-xlsx> [runs]
// Prints timings and counts only — no names, badges or certificate numbers.
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { readWorkbook, readMatrixSheets, convertMatrixWorkbook, compareSourceStatus } from '../src/lib/matrixWorkbook.js';
import { buildComplianceUniverse, calculateKPIs, getPriorityActions } from '../src/lib/complianceEngine.js';
import { filterComplianceItems } from '../src/lib/tableFilters.js';
import { getRuntimeAsOfDate } from '../src/lib/clock.js';

const file = process.argv[2];
const runs = Number(process.argv[3] || 20);
if (!file) { console.error('usage: node scripts/measure-matrix-import.mjs <xlsx> [runs]'); process.exit(1); }

const bytes = new Uint8Array(readFileSync(file));
const asOf = getRuntimeAsOfDate();
const samples = {};
const time = (name, fn) => {
  const t0 = performance.now();
  const out = fn();
  (samples[name] ||= []).push(performance.now() - t0);
  return out;
};

let last;
for (let i = 0; i < runs; i++) {
  const wb = time('1 parse xlsx (XLSX.read)', () => readWorkbook(bytes));
  const sheets = time('2 read sheets to rows', () => readMatrixSheets(wb));
  const conv = time('3 convert + validate', () => convertMatrixWorkbook(sheets));
  const cr = time('4 buildComplianceUniverse', () => buildComplianceUniverse(conv.trainingRecords, conv.requirements, asOf, conv.employees));
  time('5 calculateKPIs', () => calculateKPIs(cr.universe, cr.employees, cr.unconfiguredEmployees));
  time('6 getPriorityActions', () => getPriorityActions(cr.universe));
  time('7 compare source Status', () => compareSourceStatus(conv.sourceStatuses, cr.universe));
  const badge = cr.universe[(i * 37) % cr.universe.length].Employee_ID;
  time('8 search: full badge', () => filterComplianceItems(cr.universe, { employeeId: badge }));
  time('9 search: partial badge', () => filterComplianceItems(cr.universe, { employeeId: badge.slice(-3) }));
  time('10 filter: department + status', () => filterComplianceItems(cr.universe, { department: 'Operations', status: 'EXPIRED' }));
  last = { conv, cr };
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log(`node ${process.version} · runs ${runs} · asOf ${asOf} · file ${bytes.length} bytes`);
console.log(`items ${last.cr.universe.length} · active employees ${last.cr.employees.active.length} · records ${last.conv.trainingRecords.length}`);
for (const [name, arr] of Object.entries(samples)) {
  console.log(`${name.padEnd(34)} median ${median(arr).toFixed(2).padStart(8)} ms   first ${arr[0].toFixed(2).padStart(8)} ms   max ${Math.max(...arr).toFixed(2).padStart(8)} ms`);
}
