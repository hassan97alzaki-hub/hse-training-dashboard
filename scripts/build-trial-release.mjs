#!/usr/bin/env node
/**
 * Build a reviewable trial release.
 *
 * Produces, under `release/`:
 *   <name>/app/        the production bundle (dist)
 *   <name>/landing/    the self-contained landing page
 *   <name>/docs/       the two trial documents
 *   <name>/MANIFEST.txt  SHA-256 of every file, plus the build facts
 *   <name>.tar.gz      the same tree as one archive
 *
 * It publishes nothing. It refuses to produce an archive that contains a home
 * path, an account name, a secret-looking value, a real email domain or a data
 * file that is not the shipped demonstration set.
 *
 * Usage:
 *   node scripts/build-trial-release.mjs
 *   node scripts/build-trial-release.mjs --trial --company "Example Co" \
 *        --start 2027-01-05 --end 2027-01-11
 *   node scripts/build-trial-release.mjs --name my-release --skip-build
 */

import { execFileSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const RELEASE_DIR = join(ROOT, 'release');

/* ------------------------------------------------------------------ *
 * Arguments
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = { trial: false, company: '', start: '', end: '', name: '', skipBuild: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--trial') args.trial = true;
    if (flag === '--company') args.company = String(value ?? '');
    if (flag === '--start') args.start = String(value ?? '');
    if (flag === '--end') args.end = String(value ?? '');
    if (flag === '--name') args.name = String(value ?? '');
    if (flag === '--skip-build') args.skipBuild = true;
  }
  return args;
}

/* ------------------------------------------------------------------ *
 * Safety scan
 * ------------------------------------------------------------------ */

/**
 * Patterns that must never reach a release. Each one is assembled from
 * fragments so this file does not match its own rules.
 */
const FORBIDDEN_CONTENT = [
  { name: 'home path', pattern: new RegExp(['/Us', 'ers/'].join('')) },
  { name: 'home path (windows)', pattern: /C:\\Users\\/i },
  { name: 'account name', pattern: new RegExp(['hassan', 'ali'].join(''), 'i') },
  { name: 'private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'aws key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'bearer token', pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}/ },
  { name: 'supabase service key', pattern: /service_role[^\n]{0,40}ey[A-Za-z0-9._-]{20,}/ },
  { name: 'generic secret assignment', pattern: /\b(api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{12,}["']/i },
  { name: 'real email domain', pattern: /@(gmail|hotmail|outlook|yahoo|icloud|live|proton)\.[a-z]{2,}/i },
];

/** Files that are allowed to carry a data extension inside a release. */
const ALLOWED_DATA_FILES = new Set([
  'sample-training-data.csv',
  'sample-requirements.csv',
  'duplicate-record-test.csv',
  'invalid-date-test.csv',
]);

const TEXT_EXTENSIONS = /\.(html|htm|js|mjs|cjs|css|json|txt|md|csv|svg|map)$/i;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function scanRelease(root) {
  const problems = [];
  for (const file of walk(root)) {
    const rel = relative(root, file).split(sep).join('/');

    if (/(^|\/)\.env/.test(rel)) problems.push(`${rel}: an environment file must never be released`);
    if (/(^|\/)node_modules(\/|$)/.test(rel)) problems.push(`${rel}: node_modules must never be released`);
    if (/(^|\/)\.git(\/|$)/.test(rel)) problems.push(`${rel}: git metadata must never be released`);

    const base = rel.split('/').pop();
    if (/\.(csv|xlsx|xls)$/i.test(base) && !ALLOWED_DATA_FILES.has(base)) {
      problems.push(`${rel}: data file that is not part of the shipped demonstration set`);
    }

    if (!TEXT_EXTENSIONS.test(rel)) continue;
    const content = readFileSync(file, 'utf8');
    for (const rule of FORBIDDEN_CONTENT) {
      if (rule.pattern.test(content)) problems.push(`${rel}: contains a ${rule.name}`);
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ *
 * Manifest
 * ------------------------------------------------------------------ */

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function buildManifest(root, facts) {
  const files = walk(root)
    .map((file) => ({ rel: relative(root, file).split(sep).join('/'), file }))
    .filter((entry) => entry.rel !== 'MANIFEST.txt')
    .sort((a, b) => a.rel.localeCompare(b.rel));

  const lines = [
    'HSE Training Compliance Dashboard — trial release manifest',
    '',
    ...Object.entries(facts).map(([key, value]) => `${key}: ${value}`),
    `files: ${files.length}`,
    '',
    'sha256  size  path',
  ];
  for (const { rel, file } of files) {
    lines.push(`${sha256(file)}  ${statSync(file).size}  ${rel}`);
  }
  lines.push('');
  lines.push('Verify on another machine:');
  lines.push('  shasum -a 256 -c <(awk \'NR>FNR\' /dev/null; true)   # or compare the values above');
  lines.push('');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

function main() {
  const args = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().slice(0, 10);
  const name = args.name || `hse-trial-${stamp}${args.trial ? '-trial' : ''}`;
  const target = join(RELEASE_DIR, name);

  if (!args.skipBuild) {
    const env = { ...process.env };
    if (args.trial) {
      env.VITE_TRIAL_MODE = 'true';
      env.VITE_TRIAL_COMPANY = args.company;
      env.VITE_TRIAL_START_DATE = args.start;
      env.VITE_TRIAL_END_DATE = args.end;
    } else {
      delete env.VITE_TRIAL_MODE;
    }
    console.log(`Building${args.trial ? ' with Trial Mode' : ''}…`);
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, env, stdio: 'inherit' });
  }

  if (!existsSync(join(ROOT, 'dist'))) {
    console.error('dist/ is missing. Run without --skip-build, or build first.');
    process.exit(1);
  }

  rmSync(target, { recursive: true, force: true });
  mkdirSync(join(target, 'app'), { recursive: true });
  mkdirSync(join(target, 'landing'), { recursive: true });
  mkdirSync(join(target, 'docs'), { recursive: true });

  cpSync(join(ROOT, 'dist'), join(target, 'app'), { recursive: true });
  cpSync(join(ROOT, 'landing'), join(target, 'landing'), { recursive: true });
  for (const doc of ['TRIAL_BUILD_AND_RUN.md', 'TRIAL_OPERATIONS_RUNBOOK.md']) {
    cpSync(join(ROOT, 'docs', doc), join(target, 'docs', doc));
  }

  writeFileSync(
    join(target, 'README.txt'),
    [
      'HSE Training Compliance Dashboard — trial release',
      '',
      'app/      the application. Serve this folder with a static HTTPS host.',
      '          Do not open app/index.html directly with file://; the Vite',
      '          bundle uses root-relative module and asset paths.',
      'landing/  the landing page. One self-contained file; open it directly.',
      'docs/     how to build, run and host privately, and the trial runbook.',
      '',
      'The build processes everything in the browser: no upload, no storage',
      'after the session, no analytics and no network request of its own.',
      '',
      'The trial dates inside the build control what the page shows, not who',
      'may open it. Access is controlled where the files are hosted.',
      '',
    ].join('\n'),
  );

  console.log('Scanning the release…');
  const problems = scanRelease(target);
  if (problems.length > 0) {
    console.error(`\nRelease refused — ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    rmSync(target, { recursive: true, force: true });
    process.exit(1);
  }

  const manifest = buildManifest(target, {
    name,
    built: stamp,
    node: process.version,
    trial_mode: args.trial ? 'true' : 'false',
    trial_company: args.trial ? args.company : '(none)',
    trial_window: args.trial ? `${args.start} .. ${args.end}` : '(none)',
  });
  writeFileSync(join(target, 'MANIFEST.txt'), manifest);

  const archive = join(RELEASE_DIR, `${name}.tar.gz`);
  rmSync(archive, { force: true });
  execFileSync('tar', ['-czf', archive, '-C', RELEASE_DIR, name], { stdio: 'inherit' });

  const fileCount = walk(target).length;
  console.log('\nRelease ready (nothing was published)');
  console.log(`  folder:   ${relative(ROOT, target)}`);
  console.log(`  archive:  ${relative(ROOT, archive)}`);
  console.log(`  manifest: ${relative(ROOT, join(target, 'MANIFEST.txt'))}`);
  console.log(`  files:    ${fileCount}`);
  console.log(`  sha256:   ${sha256(archive)}  (${statSync(archive).size} bytes)`);
}

if (process.argv[1] && process.argv[1].endsWith('build-trial-release.mjs')) main();

export { scanRelease, buildManifest, FORBIDDEN_CONTENT, ALLOWED_DATA_FILES };
