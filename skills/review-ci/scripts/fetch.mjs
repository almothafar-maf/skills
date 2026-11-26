#!/usr/bin/env node
// fetch.mjs: one repository's GitHub Actions runs and jobs for a period, as TSV files for SQLite.
//
//   node fetch.mjs <owner/repo> <from> <to> <dir> [--runs-only] [--sample <hex digits>] [--events <event,...>]
//                  [--parallel <n>]
//
// <from> and <to> are UTC ISO times, such as 2025-01-06T00:00:00Z. Writes <dir>/runs.tsv, every run created in the
// period, and <dir>/jobs.tsv, the jobs of every attempt of those runs, each with a header row. --runs-only stops after
// the runs and counts them by event: fetching jobs costs one request per run. --sample fetches jobs only for runs whose
// head SHA starts with one of the digits (012345 keeps a random 37.5%), and --events only for runs of those events. A
// finished run's jobs are cached in <dir>/jobs/, so a second fetch resumes. Needs gh, signed in with read access to the
// repository's Actions.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const usage = 'usage: node fetch.mjs <owner/repo> <from> <to> <dir> [--runs-only] [--sample <hex digits>] '
  + '[--events <event,...>] [--parallel <n>]';

const args = process.argv.slice(2);
const runsOnly = args.includes('--runs-only');
if (runsOnly) args.splice(args.indexOf('--runs-only'), 1);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const sample = option('sample');
const events = option('events')?.split(',');
const parallel = Number(option('parallel') ?? 8);
const [repo, from, to, dir] = args;
if (!dir || !/^[\w.-]+\/[\w.-]+$/.test(repo) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
  console.error(usage);
  process.exit(2);
}

const RUN_FIELDS = ['id', 'workflow', 'event', 'head_branch', 'head_sha', 'run_attempt', 'created_at', 'run_started_at',
  'updated_at', 'status', 'conclusion', 'pull_requests', 'path'];
const RUN_JQ = '.workflow_runs[] | [.id, .name, .event, .head_branch, .head_sha, .run_attempt, .created_at, '
  + '(.run_started_at // ""), .updated_at, .status, (.conclusion // ""), '
  + '([.pull_requests[]?.number | tostring] | join(",")), (.path // "")] | @tsv';
const JOB_FIELDS = ['id', 'run_id', 'run_attempt', 'workflow_name', 'name', 'head_sha', 'status', 'conclusion',
  'created_at', 'started_at', 'completed_at', 'runner_name', 'runner_group_name', 'labels'];
const JOB_JQ = '.jobs[] | [.id, .run_id, .run_attempt, .workflow_name, .name, .head_sha, .status, (.conclusion // ""), '
  + '.created_at, (.started_at // ""), (.completed_at // ""), (.runner_name // ""), (.runner_group_name // ""), '
  + '(.labels | join(","))] | @tsv';

// gh api, retried: through the hourly rate limit by sleeping until it resets, and through other errors five times.
async function gh(...apiArgs) {
  for (let attempt = 1; ; attempt++) {
    try {
      return (await exec('gh', ['api', ...apiArgs], { maxBuffer: 1 << 28 })).stdout;
    } catch (error) {
      const message = String(error.stderr || error.message);
      if (/secondary rate limit/i.test(message)) {
        await sleep(60_000);
      } else if (/rate limit/i.test(message)) {
        const reset = Number((await exec('gh', ['api', 'rate_limit', '--jq', '.resources.core.reset'])).stdout);
        console.error(`Rate limit reached; waiting until ${new Date(reset * 1000).toISOString()}.`);
        await sleep(Math.max(0, reset * 1000 - Date.now()) + 5_000);
      } else if (attempt >= 5 || /HTTP 40[14]/.test(message)) {
        throw new Error(message.trim());
      } else {
        await sleep(attempt * 10_000);
      }
    }
  }
}

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

// The API returns at most 1,000 runs for one query, so a range holding more is halved until each part fits. Both ends
// of a range are inclusive, so a run created on a midpoint second can come twice; the caller drops the copy.
async function listRuns(start, end) {
  const range = `${iso(start)}..${iso(end)}`;
  const total = Number(await gh('-X', 'GET', `repos/${repo}/actions/runs`, '-f', `created=${range}`, '-f', 'per_page=1',
    '--jq', '.total_count'));
  if (total > 1000 && end - start > 1000) {
    const middle = start + Math.floor((end - start) / 2000) * 1000;
    return [...await listRuns(start, middle), ...await listRuns(middle, end)];
  }
  if (total === 0) return [];
  const out = await gh('-X', 'GET', `repos/${repo}/actions/runs`, '-f', `created=${range}`, '-f', 'per_page=100',
    '--paginate', '--jq', RUN_JQ);
  return out.split('\n').filter(Boolean);
}

mkdirSync(join(dir, 'jobs'), { recursive: true });
const runs = new Map();
for (const line of await listRuns(Date.parse(from), Date.parse(to))) runs.set(line.split('\t')[0], line);
writeFileSync(join(dir, 'runs.tsv'), [RUN_FIELDS.join('\t'), ...runs.values()].join('\n') + '\n');
console.error(`${runs.size} runs in ${from}..${to}.`);
if (runsOnly) {
  const byEvent = {};
  for (const line of runs.values()) {
    const event = line.split('\t')[2];
    byEvent[event] = (byEvent[event] ?? 0) + 1;
  }
  for (const [event, count] of Object.entries(byEvent).sort((a, b) => b[1] - a[1])) console.log(`${count}\t${event}`);
  process.exit(0);
}

// A finished run's jobs are cached by run and attempt, so a second fetch reads again only what is still going or has
// been re-run since.
const wanted = [...runs.values()].map((line) => line.split('\t'))
  .filter(([, , event, , sha]) => (!events || events.includes(event)) && (!sample || sample.includes(sha[0])))
  .map(([id, , , , , attempt, , , , status]) => ({
    id,
    finished: status === 'completed',
    file: join(dir, 'jobs', `${id}-${attempt}${status === 'completed' ? '' : '.partial'}.tsv`),
  }));
const queue = wanted.slice();
let done = 0;
const failed = [];
async function worker() {
  while (queue.length > 0) {
    const run = queue.shift();
    if (!run.finished || !existsSync(run.file)) {
      try {
        writeFileSync(`${run.file}.tmp`, await gh(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100&filter=all`,
          '--paginate', '--jq', JOB_JQ));
        renameSync(`${run.file}.tmp`, run.file);
      } catch (error) {
        failed.push(run.id);
        console.error(`Run ${run.id}: ${error.message.split('\n')[0]}`);
      }
    }
    if (++done % 200 === 0) console.error(`Jobs read for ${done} runs.`);
  }
}
await Promise.all(Array.from({ length: parallel }, worker));

const jobs = wanted.filter((run) => existsSync(run.file)).map((run) => readFileSync(run.file, 'utf8')).join('');
writeFileSync(join(dir, 'jobs.tsv'), JOB_FIELDS.join('\t') + '\n' + jobs);
console.error(`Jobs of ${wanted.length - failed.length} of ${wanted.length} selected runs in ${dir}/jobs.tsv.`);
if (failed.length > 0) {
  console.error(`${failed.length} runs failed; run the same command again to fetch them.`);
  process.exit(1);
}
