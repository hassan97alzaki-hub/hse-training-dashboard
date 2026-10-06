#!/usr/bin/env node
/**
 * Local measurement of the contract pipeline on synthetic data.
 *
 * Default: 500 employees, 5 runs, median reported (not the fastest run). The
 * numbers describe one machine and are not asserted anywhere in CI.
 *
 * The preview of the user interface is NOT measured here: it is not implemented
 * yet. The full criterion of 3 seconds from opening a file to a visible preview
 * is therefore checked by hand after Commit 10.
 *
 * Usage:
 *   node scripts/measure-contract-pipeline.mjs
 *   node scripts/measure-contract-pipeline.mjs --employees 500 --runs 5
 */

import { cpus, totalmem, platform, arch } from 'node:os';
import * as XLSX from 'xlsx';

import { generateSyntheticFullPackage, DEFAULT_SEED } from '../tests/fixtures/contract/generateSyntheticPackage.js';
import { runSyntheticPipeline, summarise, blocking } from '../tests/fixtures/contract/runSyntheticPipeline.js';
import { buildWorkbook, SHEET_ORDER } from './generate-contract-workbook.mjs';
import { createApprovedState } from '../src/lib/contract/staging.js';
import {
  readProductionWorkbook,
  validateProductionPackage,
  buildProductionPreview,
  approveProductionPackage,
} from '../src/lib/contract/productionPackage.js';

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const ms = (value) => `${value.toFixed(1)} ms`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function parseArgs(argv) {
  const args = { employees: 500, runs: 5, seed: DEFAULT_SEED };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--employees') args.employees = Number(argv[index + 1]);
    if (argv[index] === '--runs') args.runs = Number(argv[index + 1]);
    if (argv[index] === '--seed') args.seed = Number(argv[index + 1]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const samples = {
    generation: [], workbook: [], validation: [], staging: [], apply: [], preparation: [], engine: [], kpis: [], total: [],
    // The production entry: the same bytes read back through the real parser.
    productionParse: [], productionValidate: [], productionPreview: [], productionApprove: [], productionTotal: [],
  };
  const heapBefore = process.memoryUsage().heapUsed;
  let lastSummary = null;
  let lastRowCounts = null;
  let lastResult = null;
  let lastProduction = null;

  for (let run = 0; run < args.runs; run += 1) {
    const totalStart = performance.now();

    const generationStart = performance.now();
    const pkg = generateSyntheticFullPackage({ employeeCount: args.employees, seed: args.seed });
    samples.generation.push(performance.now() - generationStart);

    // XLSX write and read back, both in memory: no file touches the disk.
    const workbookStart = performance.now();
    const { workbook, rowCounts } = buildWorkbook(pkg);
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const reread = XLSX.read(buffer, { type: 'buffer' });
    for (const name of SHEET_ORDER) XLSX.utils.sheet_to_json(reread.Sheets[name]);
    samples.workbook.push(performance.now() - workbookStart);
    lastRowCounts = rowCounts;

    const result = await runSyntheticPipeline(pkg, { measure: true });
    for (const [name, value] of Object.entries(result.timings)) {
      if (samples[name]) samples[name].push(value);
    }
    samples.total.push(performance.now() - totalStart);
    lastSummary = summarise(result);
    lastResult = result;

    // The production path: XLSX buffer -> parser -> validators -> staging ->
    // preparation -> engine, exactly as the interface runs it.
    const productionStart = performance.now();
    const parseStart = performance.now();
    const parsed = await readProductionWorkbook(buffer);
    samples.productionParse.push(performance.now() - parseStart);

    const state = createApprovedState();
    const validateStart = performance.now();
    const validated = await validateProductionPackage(parsed, { approvedState: state, asOfDate: pkg.asOfDate });
    samples.productionValidate.push(performance.now() - validateStart);

    const metadata = {
      batchId: `MEASURE-${args.seed}-${run}`,
      preparedByRole: 'Training Coordinator',
      approvedByRole: 'Training Manager',
      approvedAt: '2027-01-11T08:00:00.000Z',
    };
    const previewStart = performance.now();
    const preview = await buildProductionPreview(validated, { approvedState: state, approvalMetadata: metadata });
    samples.productionPreview.push(performance.now() - previewStart);

    const approveStart = performance.now();
    const approved = await approveProductionPackage(state, validated, metadata);
    samples.productionApprove.push(performance.now() - approveStart);
    samples.productionTotal.push(performance.now() - productionStart);
    lastProduction = { validated, preview, approved };
  }

  const heapAfter = process.memoryUsage().heapUsed;

  console.log('Contract pipeline measurement — synthetic data, fictional values only');
  console.log(`  node:        ${process.version}`);
  console.log(`  platform:    ${platform()} ${arch()}`);
  console.log(`  cpu:         ${cpus().length} logical core(s), ${cpus()[0]?.model ?? 'unknown'}`);
  console.log(`  memory:      ${mb(totalmem())} total`);
  console.log(`  seed:        ${args.seed}`);
  console.log(`  runs:        ${args.runs} (median reported, not the fastest run)`);
  console.log('');
  console.log('  Data');
  console.log(`    employees:          ${lastSummary.employees}`);
  console.log(`    training records:   ${lastSummary.records}`);
  console.log(`    requirements:       ${lastSummary.requirements}`);
  console.log(`    compliance items:   ${lastSummary.complianceItems}`);
  console.log(`    blocking issues:    ${blocking(lastResult.validation.issues).length}`);
  console.log(`    other issues:       ${lastSummary.warnings}`);
  for (const name of SHEET_ORDER) console.log(`    ${name.padEnd(19)} ${lastRowCounts[name]} row(s)`);
  console.log('');
  console.log('  Median per step');
  for (const [name, values] of Object.entries(samples)) {
    if (values.length > 0) console.log(`    ${name.padEnd(19)} ${ms(median(values))}`);
  }
  console.log('');
  console.log('  Production entry (XLSX buffer -> parser -> validators -> staging -> preparation -> engine)');
  console.log(`    blocking issues:    ${lastProduction.validated.counts.blocking}`);
  console.log(`    accepted rows:      ${lastProduction.validated.counts.accepted}`);
  console.log(`    compliance items:   ${lastProduction.approved.view.compliance.universe.length}`);
  console.log(`    requirement compl.: ${lastProduction.approved.view.kpis.requirementCompliance}%`);
  console.log('');
  console.log(`  heap used before: ${mb(heapBefore)}`);
  console.log(`  heap used after:  ${mb(heapAfter)}`);
  console.log(`  heap delta:       ${mb(heapAfter - heapBefore)}`);
  console.log('');
  console.log('  The preview of the interface is not measured: it is not implemented yet.');
  console.log('  The 3-second end-to-end criterion is checked by hand after Commit 10.');
}

main();
