# sync-jira

Keeps a Jira project in step with a repository's GitHub work: tickets for work that needs one, Jira keys on PRs, statuses and releases that follow each ticket's PRs, and assignees that match who does the work. The agent follows [its SKILL.md](../skills/sync-jira/SKILL.md).

## Run it

Run `/sync-jira` in a repository, alone or followed by PR or issue numbers, Jira keys, a date, or instructions such as `statuses only`, `create missing tickets` or `fix assignees`. Alone, it covers your own work: your open PRs and issues, your PRs merged in the last 30 days, and your unresolved tickets.

It needs the Atlassian MCP server connected in your agent at `https://mcp.atlassian.com/v2/mcp?tools=all`, and `gh` signed in.

## First run

The first run in a repository drafts its Jira config, `docs/agents/jira.md`, from the repository and the Jira project, and saves it once you confirm; [config.md](../skills/sync-jira/config.md) lists what it holds. A repository with its own `sync-jira` skill keeps using that one.

## What it changes

On your own tickets it applies status moves, links, labels and release details, then lists them. It also flags a ticket or issue whose assignee is not the person doing the work, and offers the fix; by default it checks only your own work.

Creating a ticket, editing a PR, changing an assignee, or changing a ticket assigned to someone else or to nobody waits for your go, unless your text already asked for it. That plan opens and closes with a ⏸️ line counting the items that wait for you, numbered so that `go` or `go, drop 3` answers them all, and until you answer, every later reply in the session starts with that line.

## Cost

A run takes a while and uses a lot of tokens, since it reads every PR, issue and ticket in its scope to the last page and re-reads each ticket it changes. A full run on one repository, over 29 tickets and 40 merged PRs, took about 35 minutes and 92 model calls on Claude Opus 5.5, reading about 25 million input tokens, most of them from the prompt cache, and writing about 220 thousand. A narrower run reads less: name PRs, issues, Jira keys or a date, and keep the full run for a regular check-in, such as once a week or after a release.
