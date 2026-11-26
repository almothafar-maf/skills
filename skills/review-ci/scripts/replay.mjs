#!/usr/bin/env node
// replay.mjs: how long jobs would wait for a runner on a pool of N ephemeral runners, by replaying measured jobs.
//
//   node replay.mjs <pool.tsv> (--calibrate <runners> | --gap <s> | --gaps <file>) [--runners 2-8] [--load 1,1.35]
//                   [--pickup 2] [--seeds 20]
//
// <pool.tsv> has a header row naming created_at, started_at and completed_at, UTC ISO times, and one row for each job
// the pool ran, from every repository that shares it. In the replay each job takes the runner that frees up first,
// starts --pickup seconds later, and holds the runner for its run time plus a re-create gap. The gap is --gap seconds,
// or drawn at random from --gaps, a file of gaps in seconds, or, with --calibrate, the fixed gap whose replay on the
// pool's size during the period comes closest to the measured median and slowest-10% wait. --load replays the same jobs
// arriving that many times as often. Prints the measured wait, then the replayed waits for each pool size and load.
import { readFileSync } from 'node:fs';

const usage = 'usage: node replay.mjs <pool.tsv> (--calibrate <runners> | --gap <s> | --gaps <file>) [--runners 2-8] '
  + '[--load 1,1.35] [--pickup 2] [--seeds 20]';
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const file = args[0];
const gapOptions = ['calibrate', 'gap', 'gaps'].filter((name) => option(name) !== undefined);
if (!file || file.startsWith('--') || gapOptions.length !== 1) {
  console.error(usage);
  process.exit(2);
}

const [header, ...rows] = readFileSync(file, 'utf8').trim().split('\n').map((line) => line.split('\t'));
const column = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`${file} has no ${name} column`);
  return i;
};
const [created, started, completed] = ['created_at', 'started_at', 'completed_at'].map(column);
const seconds = (iso) => Date.parse(iso) / 1000;
const jobs = rows
  .map((row) => ({
    at: seconds(row[created]),
    wait: seconds(row[started]) - seconds(row[created]),
    run: seconds(row[completed]) - seconds(row[started]),
  }))
  .filter((job) => Number.isFinite(job.at + job.wait + job.run) && job.wait >= 0)
  .sort((a, b) => a.at - b.at);
let gaps = option('gaps') === undefined
  ? [Number(option('gap') ?? 0)]
  : readFileSync(option('gaps'), 'utf8').trim().split(/\s+/).map(Number).filter(Number.isFinite);
const current = Number(option('calibrate', 1));
const [fewest, most = fewest] = option('runners', '2-8').split('-').map(Number);
const loads = option('load', '1').split(',').map(Number);
const pickup = Number(option('pickup', '2'));
const seeds = Number(option('seeds', '20'));
if (jobs.length === 0 || gaps.length === 0
  || [current, fewest, most, pickup, seeds, ...gaps, ...loads].some(Number.isNaN)) {
  console.error(usage);
  process.exit(2);
}

const quantile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.max(0, Math.ceil(p * sorted.length - 1e-9) - 1)]);
};
const summary = (waits) => `median ${quantile(waits, 0.5)} s, slowest 10% ${quantile(waits, 0.9)} s`;

// A seeded generator, so a replay gives the same figures every time it runs.
function random(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function replay(runners, load) {
  const first = jobs[0].at;
  const waits = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const next = random(seed);
    const free = Array(runners).fill(-Infinity);
    for (const job of jobs) {
      const at = first + (job.at - first) / load;
      let runner = 0;
      for (let i = 1; i < runners; i++) if (free[i] < free[runner]) runner = i;
      const start = Math.max(at, free[runner]) + pickup;
      free[runner] = start + job.run + gaps[Math.floor(next() * gaps.length)];
      waits.push(start - at);
    }
  }
  return waits;
}

const measured = jobs.map((job) => job.wait);
console.log(`Measured: ${jobs.length} jobs, ${summary(measured)}.`);
if (option('calibrate') !== undefined) {
  const miss = (waits) => Math.abs(quantile(waits, 0.5) - quantile(measured, 0.5))
    + Math.abs(quantile(waits, 0.9) - quantile(measured, 0.9));
  let best;
  for (let gap = 0; gap <= 120; gap++) {
    gaps = [gap];
    const waits = replay(current, 1);
    if (best === undefined || miss(waits) < best.miss) best = { gap, miss: miss(waits), waits };
  }
  gaps = [best.gap];
  console.log(`Calibrated gap: ${best.gap} s, replaying ${current} runners at ${summary(best.waits)}.`);
}
for (let runners = fewest; runners <= most; runners++) {
  const results = loads.map((load) => `load ${load}: ${summary(replay(runners, load))}`);
  console.log(`${runners} runners: ${results.join('; ')}`);
}
