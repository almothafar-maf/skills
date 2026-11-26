# review-ci

Reviews a repository's GitHub Actions pull request pipelines from its own run history, then cuts repeated, needless and queued jobs while every required check keeps reporting. The agent follows [its SKILL.md](../skills/review-ci/SKILL.md).

## Run it

Run `/review-ci` in a repository, alone or followed by a period, workflow names, `re-measure`, or instructions. Alone, it covers every workflow that runs on pull requests, over the last four complete weeks.

It needs `gh` signed in with read access to the repository's Actions, Node 18 or later, and `sqlite3`.

## What it does

It maps the pipelines that run on pull requests and the checks a merge requires, measures the runs from the GitHub API, and checks them against a list of known waste, from commits checked twice and checks cancelled into false failures to jobs run on changes they cannot affect and quick jobs queued behind builds. It then proposes fixes ranked by measured gain, each with its owner: the repository, or the platform team that runs the runners.

Nothing is committed, pushed or opened until you answer that plan; each approved fix gets its own PR, and `/review-ci re-measure` a week later reports what each one bought.

Its scripts fetch the run history, compute the metrics, and size a runner pool by replaying the jobs it ran; [reference.md](../skills/review-ci/reference.md) defines each metric and pattern.

## Cost

Fetching takes one API request for each workflow run: about 260 runs took 40 seconds. A repository with thousands of runs a week reaches the hourly rate limit, so the run samples the weeks before its baseline, and the script waits for the limit to reset when it has to.
