# Skills

Agent skills by [@almothafar-maf](https://github.com/almothafar-maf), in the [Agent Skills](https://agentskills.io) format, so Copilot, Claude Code, Codex and other agents can run them.

| Skill | What it does |
| --- | --- |
| [`sync-jira`](skills/sync-jira/SKILL.md) | Keeps a Jira project in step with a repository's GitHub work: tickets for work that needs one, Jira keys on PRs, and statuses and releases that follow each ticket's PRs |

## Install

With the GitHub CLI, once per agent:

```bash
gh skill install almothafar-maf/skills sync-jira --agent claude-code --scope user
gh skill install almothafar-maf/skills sync-jira --agent github-copilot --scope user
```

Or with the `skills` CLI, for several agents at once:

```bash
npx skills add almothafar-maf/skills -g --agent github-copilot claude-code --skill sync-jira
```

`gh skill update sync-jira`, or `npx skills update sync-jira -g`, brings an install up to date. Leave out `--scope user` or `-g` to install into the current repository instead of your home directory.

## sync-jira

Run `/sync-jira` in a repository, alone or followed by PR or issue numbers, Jira keys, a date, or instructions such as `statuses only` or `create missing tickets`. It needs the Atlassian MCP server connected in your agent and `gh` signed in.

The first run in a repository drafts its Jira config, `docs/agents/jira.md`, from the repository and the Jira project, and saves it once you confirm; [config.md](skills/sync-jira/config.md) lists what it holds. A repository with its own `sync-jira` skill keeps using that one.

On your own tickets it applies status moves, links, labels and release details, then lists them. Creating a ticket, editing a PR, or changing someone else's ticket waits for your go, unless your text already asked for it.
