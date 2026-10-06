#!/usr/bin/env node
/**
 * Write the synthetic `HSE-DC-1.0` package to an .xlsx file, on request only.
 *
 * The data is fictional and uses reserved values only. The file is never
 * written during the tests and is never committed. By default it goes to the
 * temporary directory of the operating system; pass --output to choose a path.
 *
 * Usage:
 *   node scripts/generate-contract-workbook.mjs
 *   node scripts/generate-contract-workbook.mjs --employees 500 --seed 20270112
 *   node scripts/generate-contract-workbook.mjs --output ./out/package.xlsx
 *
 * The output lists the path, the seed and row counts only: no employee name and
 * no other value is printed.
 */

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as XLSX from 'xlsx';

import {
  generateSyntheticFullPackage,
  DEFAULT_SEED,
} from '../tests/fixtures/contract/generateSyntheticPackage.js';

/** The sheets of a `full` package, in contract order. */
export const SHEET_ORDER = Object.freeze([
  '_Contract',
  'Departments',
  'Job_Titles',
  'Employees',
  'Courses',
  'Requirements',
  'Training_Records',
]);

/** Build the workbook in memory. Nothing is written here. */
export function buildWorkbook(pkg) {
  const sheets = {
    _Contract: [pkg.contract],
    Departments: pkg.departments,
    Job_Titles: pkg.jobTitles,
    Employees: pkg.employees,
    Courses: pkg.courses,
    Requirements: pkg.requirements,
    Training_Records: pkg.trainingRecords,
  };
  const workbook = XLSX.utils.book_new();
  for (const name of SHEET_ORDER) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheets[name]), name);
  }
  return { workbook, rowCounts: Object.fromEntries(SHEET_ORDER.map((name) => [name, sheets[name].length])) };
}

function parseArgs(argv) {
  const args = { employees: 500, seed: DEFAULT_SEED, output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--employees') args.employees = Number(value);
    if (flag === '--seed') args.seed = Number(value);
    if (flag === '--output') args.output = String(value ?? '');
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const pkg = generateSyntheticFullPackage({ employeeCount: args.employees, seed: args.seed });
  const { workbook, rowCounts } = buildWorkbook(pkg);
  const output = args.output || join(tmpdir(), `hse-contract-synthetic-${args.seed}-${args.employees}.xlsx`);

  writeFileSync(output, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

  console.log('Synthetic HSE-DC-1.0 workbook written (fictional test data only)');
  console.log(`  path:      ${output}`);
  console.log(`  seed:      ${args.seed}`);
  console.log(`  employees: ${args.employees}`);
  for (const name of SHEET_ORDER) {
    console.log(`  ${name.padEnd(17)} ${rowCounts[name]} row(s)`);
  }
}

// Only run when this file is the entry point, so the builder stays importable.
if (process.argv[1] && process.argv[1].endsWith('generate-contract-workbook.mjs')) main();
