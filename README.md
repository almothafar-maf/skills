# Skills

Agent skills by [@almothafar-maf](https://github.com/almothafar-maf), in the [Agent Skills](https://agentskills.io) format, so Claude Code, GitHub Copilot, Cursor and other agents can run them.

| Skill | What it does |
| --- | --- |
| [`sync-jira`](docs/sync-jira.md) | Keeps a Jira project in step with a repository's GitHub work: tickets for work that needs one, Jira keys on PRs, statuses and releases that follow each ticket's PRs, and assignees that match who does the work |
| [`review-ci`](docs/review-ci.md) | Reviews a repository's GitHub Actions pull request pipelines from its own run history, then cuts repeated, needless and queued jobs while every required check keeps reporting |

## Install

Every route installs all the skills here, and the plugin routes bring in skills added later. Pick one route per agent: a skill installed twice shows up twice. [docs/install.md](docs/install.md) has each route's commands.

| Agent | Route | Updates |
| --- | --- | --- |
| [Claude Code](docs/install.md#claude-code) | Plugin | Itself, once you turn on auto-update |
| [GitHub Copilot CLI](docs/install.md#github-copilot-cli) | Plugin | Itself, once you turn on auto-update |
| [VS Code with GitHub Copilot](docs/install.md#vs-code-with-github-copilot) | Plugin | Itself, daily |
| [Cursor](docs/install.md#cursor-and-any-other-agent) | Files in `~/.cursor/skills` | By hand |
| [Any other agent](docs/install.md#cursor-and-any-other-agent) | Files in `~/.agents/skills` | By hand |

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers adding a skill, the checks to run and how to write for a public repository.

## License

[MIT](LICENSE)
