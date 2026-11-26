# Pipelines, metrics and fixes

The definitions, waste patterns and methods `/review-ci` relies on, whatever the repository. The scripts named here sit in this skill's [scripts/](./scripts/) folder.

## Metrics

[`metrics.sql`](./scripts/metrics.sql) computes these for each period from the `runs` and `jobs` tables imported from `fetch.mjs`'s output. It reads three tables you fill:

- `required(name)`: the checks a merge requires, by job name. A job of a reusable workflow reports as `<calling job> / <called job>`.
- `periods(label, start_at, end_at)`: UTC ISO times, such as `2025-01-06T00:00:00Z`; a push belongs to the period its first run falls in.
- `kinds(sha, kind)`, optional: `docs` or `code` for each push. When a job already skips itself on changes without code, its conclusion gives the kind: `INSERT OR REPLACE INTO kinds SELECT r.head_sha, CASE WHEN SUM(j.conclusion != 'skipped') = 0 THEN 'docs' ELSE 'code' END FROM runs r JOIN jobs j ON j.run_id = r.id WHERE r.event = 'pull_request' AND j.name = '<test job>' GROUP BY r.head_sha`. Otherwise classify each pull request by its changed files.

The definitions:

- **Push**: one commit pushed to a pull request: a head SHA with a `pull_request` run, timed by its first run. Its jobs are those of its `pull_request` and `pull_request_target` runs, every attempt. Work that reviews, issues, schedules or `workflow_run` start belongs to no push: judge it from its own rows in `jobs`, fetched without `--events`.
- **Execution**: a job a runner took that started after it was created. A re-run attempt also lists the jobs it carried over from the attempt before, with a start before their creation; they are copies, not work.
- **Jobs per push**: executions per push on each runner pool, where a pool is a job's runner labels. It is an average, so report the typical push beside it: the median, fewest and most.
- **Wait**: from a job's creation to its start, for each execution: the queue for a runner.
- **Time to green**: from the push until every required check on its SHA has passed or been skipped. A skipped job counts as passing for a required check. A push that never goes green, because a check failed or the commit was replaced first, stays out of the figure; `went_green` counts the rest.
- **Repeat run**: a further `pull_request` run of a workflow on a SHA it had already checked. A manual re-run is a new attempt of the same run, so it is no repeat. Checks that read the title or description repeat on every edit, as they should.
- **False red**: a job cancelled on a SHA where a job of the same name passed. GitHub shows it as a failed check on a commit that passed, and people re-run or investigate it.

Medians and the slowest 10% are nearest-rank, in `metrics.sql` and `replay.mjs` alike: the value at position ⌈p·n⌉ of the sorted n values, so the median of an even count is the lower middle one.

Fetching: `fetch.mjs` lists every run in the period, halving the date range until each part is under the 1,000 runs the API returns for one query, then reads each run's jobs, one request per run. `gh api rate_limit` shows the requests left this hour, and the script sleeps through the limit when it runs out. When the jobs of the whole period need more requests than an hour allows, fetch the baseline week in full and the weeks before it with `--sample 012345`, into a second folder, and import it with `.import --skip 1`, since the first import already made the tables. Leave out hours that distort the waits, such as a runner pool's first hour online or an outage, and say so. Every API time is UTC.

## Patterns

Each pattern names what the data shows, the fix, and who owns it: the **repository**, for its workflow files and scripts, or the **platform team**, for runner pools, shared reusable workflows and organisation rulesets.

### Edits re-run unchanged commits

**Data**: repeat runs of build, test or guard workflows, seconds after a push or when a draft is marked ready: editing the title or description, a draft change or a label starts every workflow subscribed to it, on the same commit.

**Fix**: start build, test and guard workflows on `types: [opened, synchronize, reopened]`. Only checks that read the title or description keep `edited`, and only checks that read labels keep `labeled`. A workflow that skips drafts keeps `ready_for_review`, since its first real run comes then. **Owner**: the repository.

Leave an event out of `types` rather than skipping every job on it: a skipped job counts as passing and becomes the commit's latest result for that check, so a skip on an edit can turn a failed required check green. `edited` also fires when a pull request's base branch changes, so without it the checks keep their result from the old base, as they do whenever the base branch moves on; a ruleset that requires branches to be up to date before merging re-runs them against the new base.

### Edits and reopens cancel running checks

**Data**: false reds.

**Fix**: one concurrency group for each workflow and pull request, cancelling a run only when new code makes it obsolete:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.sha }}
  cancel-in-progress: ${{ github.event.action == 'synchronize' }}
```

An edit, a reopen and a draft change keep the commit, so their run waits for the one in progress instead of cancelling it. GitHub keeps one waiting run per group, so a newer one still replaces it, and the replaced run ends cancelled; `queue: max` keeps every waiting run, but GitHub rejects it beside `cancel-in-progress: true`. A push to the default branch keys its group on the SHA, so merges that land together each keep their own post-merge run. **Owner**: the repository.

### Jobs run on changes they cannot affect

**Data**: heavy jobs on docs-only pushes; for each job, the share of recent pull requests that changed none of its inputs.

**Fix**: a **router** job lists the changed files and the jobs they leave untouched, and each of those jobs skips itself with `if:`, so its check still reports, as skipped, which counts as passing. Each of these holds, with a test:

- The skip lives in the job. A workflow-level `paths:` or `paths-ignore:` on a workflow that provides a required check leaves the check unreported on the pull requests it filters out, and those pull requests wait for it forever.
- **Fail open**: when the router fails, every job runs, even if it published a list before failing. Each job's condition reads `${{ !cancelled() && (needs.<router>.result != 'success' || !contains(fromJSON(needs.<router>.outputs.skip || '[]'), '<job>')) }}`.
- A change to the CI itself, the workflow or the router's rules, runs every job, and so does every push to the default branch.
- A job's inputs are every file it reads: source, and also the fixtures and configuration its tests load, its lint and formatter settings, and the build scripts it runs. Search the tests for file reads to find them.
- A **gate** job that turns several jobs into one required check accepts a skip only when the router asked for it, so a job skipped by a failure fails the gate.

**Forecast**: replay the last 60 merged pull requests' changed files through the new rules: the jobs each would have skipped, and any pull request where a skipped job had failed. `gh pr list --state merged --limit 60 --json number,files` lists at most 100 files a pull request; read a longer one in full with `gh api --paginate repos/{owner}/{repo}/pulls/<n>/files`, which stops at 3,000, and count a pull request it cannot list in full as running every job. **Owner**: the repository.

### Quick jobs queue behind builds

**Data**: jobs that run for seconds, such as title and description checks, labelers, project board sync and gates, waiting as long as the builds on the same pool.

**Fix**: move them to a pool for small jobs or to a small GitHub-hosted runner. A job holding a long-lived secret, such as a personal access token, runs only where each job starts on a clean machine and only trusted repositories run jobs: a GitHub-hosted runner, or an ephemeral self-hosted pool limited to them. **Owner**: the repository moves the jobs; the platform team runs the pool.

### Everything waits on a slow-starting job

**Data**: a job that most others `needs:`, such as a router, waiting for a runner before any real work starts.

**Fix**: give it the fastest-starting runner on offer, often a small GitHub-hosted one, which starts in seconds and costs little for a job this short. **Owner**: the repository.

### A small-job pool sized below its bursts

**Data**: a fixed pool whose typical wait is a multiple of its runners' re-create time: one push queues more quick jobs at once than the pool has runners, and each ephemeral runner needs a new pod after every job.

**Fix**: size the pool with [Pool sizing](#pool-sizing), counting every repository that shares it. Keep shared runners ephemeral: a persistent runner carries one job's files and processes into the next, across every repository that can use the pool. **Owner**: the platform team.

### Shared workflows run on every push

**Data**: a reusable workflow from another repository (`uses: <owner>/<repo>/.github/workflows/<file>@<ref>`), such as a security scan or an image build, running for minutes on docs-only pushes.

**Fix**: an input in the shared workflow that skips the changes it cannot affect, so every repository that calls it gains at once. Changing a security scan's scope needs its owners' agreement. **Owner**: the shared workflow's owners, often the platform team.

### Merges rebuild for documentation

**Data**: deploys or image builds on pushes to the default branch that changed only documentation.

**Fix**: `paths-ignore` on those push-triggered workflows, which no pull request waits for; a release workflow keeps every path its releases need. **Owner**: the repository.

### Check names

Merging jobs, or renaming one, renames the checks the rulesets require. Keep each required check's name, or change the ruleset in the same step, with the repository's admins.

## Pool sizing

[`replay.mjs`](./scripts/replay.mjs) replays the jobs a pool ran against pools of other sizes: each job takes the runner that frees up first, starts after a pickup delay, and holds the runner for its run time plus the time its pod takes to re-create.

1. Export every job the pool ran in the period, from every repository that shares it, each fetched with `fetch.mjs` and no `--events`, since jobs of every event take the pool's runners: `sqlite3 -header -tabs ci.db "SELECT created_at, started_at, completed_at FROM jobs WHERE labels LIKE '%<pool label>%' AND runner_name != '' AND started_at >= created_at ORDER BY created_at" > pool.tsv`.
2. Run `node replay.mjs pool.tsv --calibrate <runners in the period> --runners 2-8 --load 1,<busier>`. `--calibrate` picks the re-create gap whose replay at today's size comes closest to the measured waits; a gap from 10 to 40 seconds is typical. `<busier>` brings the period up to a busy recent week's pace: that week's pushes per working day over the period's.
3. Recommend the smallest pool whose slowest 10% start within a few seconds at the busier load, with what it adds in CPU and memory.

## Cost

- **GitHub-hosted runners** bill each job by the minute, rounded up, at the price on GitHub's pricing page, once the organisation's included minutes run out. Count the minutes a fix moves onto them.
- **Self-hosted runners** cost machines, not GitHub minutes. Report pod launches and runner-hours per push and per month. A GitHub-hosted price for the same minutes illustrates their size; label it as an illustration.
- A monthly figure is the change per push times the pushes a month at the recent pace; give its range at the longer-term pace too.
