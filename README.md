# Skills

Agent skills by [@almothafar-maf](https://github.com/almothafar-maf), in the [Agent Skills](https://agentskills.io) format, so Claude Code, GitHub Copilot, Cursor and other agents can run them.

| Skill | What it does |
| --- | --- |
| [`sync-jira`](skills/sync-jira/SKILL.md) | Keeps a Jira project in step with a repository's GitHub work: tickets for work that needs one, Jira keys on PRs, statuses and releases that follow each ticket's PRs, and assignees that match who does the work |
| [`review-ci`](skills/review-ci/SKILL.md) | Reviews a repository's GitHub Actions pull request pipelines from its own run history, then cuts repeated, needless and queued jobs while every required check keeps reporting |

## Install

Every route installs all the skills here. The plugin routes also bring in skills added later, with their next update. Pick one route per agent: a skill installed twice shows up twice.

| Agent | Route | Updates |
| --- | --- | --- |
| Claude Code | Plugin | Itself, once you turn on auto-update |
| GitHub Copilot CLI | Plugin | Itself, once you turn on auto-update |
| VS Code with GitHub Copilot | Plugin | Itself, daily |
| Cursor | Files in `~/.cursor/skills` | By hand |
| Any other agent | Files in `~/.agents/skills` | By hand |

### Claude Code

```bash
claude plugin marketplace add almothafar-maf/skills
claude plugin install almothafar@almothafar-maf
```

To have it update itself, run `/plugin`, open **Marketplaces**, select `almothafar-maf` and choose **Enable auto-update**. Otherwise `claude plugin update almothafar@almothafar-maf` updates it. Claude Code puts the plugin's name in front of its skills, so `/sync-jira` runs as `/almothafar:sync-jira`.

### GitHub Copilot CLI

```bash
copilot plugin marketplace add almothafar-maf/skills
copilot plugin install almothafar@almothafar-maf
```

To have it update itself, add `"autoUpdate": true` to the `almothafar-maf` entry that the first command wrote to `~/.copilot/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "almothafar-maf": { "source": { "source": "github", "repo": "almothafar-maf/skills" }, "autoUpdate": true }
  }
}
```

Otherwise `copilot plugin update almothafar@almothafar-maf` updates it. The skill runs as `/sync-jira`.

### VS Code with GitHub Copilot

Run **Chat: Install Plugin from Source** and enter `https://github.com/almothafar-maf/skills`. VS Code checks for updates daily while `extensions.autoUpdate` is on, as it is by default, and **Chat: Update Plugins** updates it at once. VS Code also loads plugins the Copilot CLI installed, so one of the two installs is enough. Like Claude Code, it runs the skill as `/almothafar:sync-jira`.

### Cursor and any other agent

```bash
gh skill install almothafar-maf/skills --all --agent cursor --scope user     # Cursor: ~/.cursor/skills
gh skill install almothafar-maf/skills --all --agent universal --scope user  # any other agent: ~/.agents/skills
```

`~/.agents/skills` is the shared folder that Codex and other Agent Skills agents read. Cursor and the Copilot CLI read it too, so use it for them only in place of their own route. For another agent's own folder, swap `--agent` for one that `gh skill install --help` lists, or run `gh skill install almothafar-maf/skills` alone to pick the skills, the agent and the scope from prompts.

Files installed with `gh skill` do not update themselves: `gh skill update --all` refreshes them, and running the install again with `--force` adds skills published since. Keep `--scope user`, since a project install writes into the repository you run it in.

## Adding a skill

Put it in `skills/<name>/SKILL.md`, with a frontmatter `name` that matches the folder, and add a row for it to the table above. Plugin installs pick it up with their next update: the plugin carries no `version`, so each commit counts as a new one. `claude plugin validate .` and `claude plugin validate .claude-plugin/plugin.json` check the manifests, and their warning about the missing version is expected.

## sync-jira

Run `/sync-jira` in a repository, alone or followed by PR or issue numbers, Jira keys, a date, or instructions such as `statuses only`, `create missing tickets` or `fix assignees`. It needs the Atlassian MCP server connected in your agent at `https://mcp.atlassian.com/v2/mcp?tools=all`, and `gh` signed in.

The first run in a repository drafts its Jira config, `docs/agents/jira.md`, from the repository and the Jira project, and saves it once you confirm; [config.md](skills/sync-jira/config.md) lists what it holds. A repository with its own `sync-jira` skill keeps using that one.

On your own tickets it applies status moves, links, labels and release details, then lists them. It also flags a ticket or issue whose assignee is not the person doing the work, and offers the fix; by default it checks only your own work. Creating a ticket, editing a PR, changing an assignee, or changing a ticket assigned to someone else or to nobody waits for your go, unless your text already asked for it. That plan opens and closes with a ⏸️ line counting the items that wait for you, numbered so that `go` or `go, drop 3` answers them all, and until you answer, every later reply in the session starts with that line.

### Cost

A run takes a while and uses a lot of tokens, since it reads every PR, issue and ticket in its scope to the last page and re-reads each ticket it changes. A full run on one repository, over 29 tickets and 40 merged PRs, took about 35 minutes and 92 model calls on Claude Opus 5.5, reading about 25 million input tokens, most of them from the prompt cache, and writing about 220 thousand. A narrower run reads less: name PRs, issues, Jira keys or a date, and keep the full run for a regular check-in, such as once a week or after a release.

## review-ci

Run `/review-ci` in a repository, alone or followed by a period, workflow names, `re-measure`, or instructions. It maps the pipelines that run on pull requests and the checks a merge requires, measures the last four weeks of runs from the GitHub API, and checks them against a list of known waste, from commits checked twice and checks cancelled into false failures to jobs run on changes they cannot affect and quick jobs queued behind builds. It then proposes fixes ranked by measured gain, each with its owner: the repository, or the platform team that runs the runners. Nothing is committed, pushed or opened until you answer that plan; each approved fix gets its own PR, and `/review-ci re-measure` a week later reports what each one bought.

It needs `gh` signed in with read access to the repository's Actions, Node 18 or later, and `sqlite3`. Its scripts fetch the run history, compute the metrics, and size a runner pool by replaying the jobs it ran; [reference.md](skills/review-ci/reference.md) defines each metric and pattern.

### Cost

Fetching takes one API request for each workflow run: about 260 runs took 40 seconds. A repository with thousands of runs a week reaches the hourly rate limit, so the run samples the weeks before its baseline, and the script waits for the limit to reset when it has to.

## License

[MIT](LICENSE)
