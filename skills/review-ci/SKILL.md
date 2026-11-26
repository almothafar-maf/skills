---
name: review-ci
description: "Review a repository's GitHub Actions pull request pipelines from its own run history, then cut repeated, needless and queued jobs while every required check keeps reporting. Measuring a busy repository's month takes thousands of API requests."
argument-hint: "[period, workflow names, re-measure, or instructions]"
disable-model-invocation: true
---

# Review CI

Finds where a repository's GitHub Actions pipelines spend runner time and developers' waiting on work that changes nothing, measures it from the repository's own run history, and fixes it one small pull request at a time: commits checked twice, checks cancelled into false failures, jobs run on changes they cannot affect, quick jobs queued behind builds, and runner pools smaller than their bursts. Every finding and forecast rests on measured runs, so the report shows what each change bought.

Text typed after `/review-ci` narrows or steers the run: a period (`last 4 weeks`, `since 1 Nov`), workflow names, `re-measure` to report what changes already made have bought, or instructions. Without text, the scope is every workflow that runs on pull requests, over the last four complete weeks.

The metrics, the waste patterns and their fixes, pool sizing and cost are in [reference.md](./reference.md). The scripts in [scripts/](./scripts/) fetch the run history, compute the metrics and replay a runner pool; they need `gh` signed in with read access to the repository's Actions, Node 18 or later, and `sqlite3`. Run them by their path in this skill's folder, written `<skill>` below, and keep their data outside the repository.

## Ground rules

- **Measured**: each finding cites the run data: the pushes, jobs, minutes or waits it costs. A pattern the YAML suggests but the data does not show ranks last.
- **Required checks keep reporting**: after every change, each check the default branch requires still reports on every pull request, as passed, failed or skipped. [Jobs run on changes they cannot affect](./reference.md#jobs-run-on-changes-they-cannot-affect) has the rules.
- **Confirm first**: commits, pushes, pull requests, and changes to runners, rulesets or organisation settings wait for the user's go. Put the plan in your reply and end the turn.
- **One fix per pull request**: small, revertible on its own, and naming the metric it should move.
- **Owned**: every fix names its owner, the repository or the platform team, as [Patterns](./reference.md#patterns) defines them.

## 1. Map the setup

List every workflow that runs on pull request events, and every workflow those start through `workflow_run`. For each, note its events and their `types`, its `concurrency`, and for each job its `runs-on`, `if:` and `needs:`, including the jobs of each reusable workflow it calls from another repository. Read the checks a merge requires from the default branch's rulesets, `gh api repos/{owner}/{repo}/rules/branches/<default branch>`, and from its classic branch protection, `gh api repos/{owner}/{repo}/branches/<default branch> --jq .protection.required_status_checks.contexts`, which read access can see; the `/protection` endpoints answer 404 to anyone who is not an admin. For each runner pool, find out whether it is GitHub-hosted or self-hosted, ephemeral or persistent, fixed or autoscaled, and which other repositories use it; ask the user what the repository cannot tell you.

Find when the pipeline took its current shape, with `git log -- .github/workflows`: weeks before a big change measure a different pipeline.

**Done when** one table lists every workflow that runs on pull requests, with its triggers, its jobs, their runners and which of them are required, and the date the pipeline took its current shape is known.

## 2. Measure

The period is the last four complete weeks, or the weeks since the pipeline took its current shape. The **baseline** is the latest complete week, and the weeks before it show whether it is typical. With `re-measure`, the baseline is the last complete week before the first change, and each change starts a period of its own at its merge.

1. Count the runs: `node <skill>/scripts/fetch.mjs <owner/repo> <from> <to> <dir> --runs-only`.
2. Fetch the jobs: `node <skill>/scripts/fetch.mjs <owner/repo> <from> <to> <dir> --events pull_request,pull_request_target`, sampling as [Metrics](./reference.md#metrics) says when the rate limit cannot cover every run. Leave `--events` off when step 1 found `workflow_run` workflows or a runner pool to size, since their jobs come from other events; `metrics.sql` reads only the pull request runs either way.
3. Import them into a new database, since an import into tables that exist adds every row again, its header row with them: `rm -f <dir>/ci.db && sqlite3 <dir>/ci.db -cmd '.mode tabs' '.import <dir>/runs.tsv runs' '.import <dir>/jobs.tsv jobs'`.
4. Create and fill `required`, `periods`, one for each week, and `kinds` as [Metrics](./reference.md#metrics) describes, then run `sqlite3 -header -column <dir>/ci.db < <skill>/scripts/metrics.sql`.

**Done when** every metric has a figure for each week, and each way the baseline differs from the weeks before it is written down.

## 3. Find the waste

Check the data against every pattern in [Patterns](./reference.md#patterns), and look for waste they do not name. For each, record whether the data shows it, what it costs per push and per month, and its fix and owner. Workflow names in the text limit this search to their waste; the measurements still cover every workflow, since time to green waits on every required check.

**Done when** every pattern is marked present, with its cost, or absent.

## 4. Propose, then wait

Rank the fixes by measured gain for the effort. For each, give the pattern, the evidence, the change, its owner, its risk, and the metric it should move and by how much. Forecast a scoping change as its pattern describes, and size a runner pool with [Pool sizing](./reference.md#pool-sizing). A fix the platform team owns becomes a request written for them: the change, the evidence and the effect expected.

Number every item from 1, open and close the plan with the waiting line, and end the turn:

> ⏸️ **Waiting for your answer: 4 items.** Reply `go` to apply them all, or name the numbers to change or drop, such as `go, drop 3`.

The plan stays open until the user answers it: a reply about something else starts with the waiting line, until the plan is answered or dropped.

**Done when** the user has answered.

## 5. Implement

Work through the approved items in order, one branch and one pull request each. Give scoping logic a test for each rule, for failing open and for a change to the CI itself; pass the repository's own checks; and name in the pull request body the metric the change should move.

**Done when** each approved item has a pull request whose required checks pass, or its blocker is reported.

## 6. Re-measure and report

Once the changes have seen a week of pushes, measure again as step 2 does with `re-measure`. Report each metric for the baseline and for each period since a change: the median and the slowest 10%, each average labelled as one with the typical push beside it, the pushes behind every figure, and the [cost](./reference.md#cost) of anything added, such as hosted minutes. A period shorter than a week is an early read; say so. Describe what the pipeline did, not who triggered it.

**Done when** every metric the plan named has a figure before and after, or is marked too early to tell.
