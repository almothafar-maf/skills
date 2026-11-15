---
name: sync-jira
description: "Keep a Jira project in step with a repository's GitHub work: tickets for work that needs one, Jira keys on PRs, and statuses and releases that follow each ticket's PRs, by the repository's Jira config, which it sets up on first use. Run as /sync-jira, alone or with PR or issue numbers, Jira keys, a date, set up, or instructions."
argument-hint: "[PR/issue numbers, Jira keys, since <date>, set up, or instructions]"
disable-model-invocation: true
---

# Sync Jira

Keeps a Jira project in step with the GitHub work in the current repository: work that needs a ticket has one, each PR names its ticket, and each ticket's status and release follow its PRs. How the repository maps to Jira, from the site and board to the statuses and the way a merge reaches dev, lives in a config file, so the same steps serve any repository.

Text typed after `/sync-jira` narrows or steers the run: PR or issue numbers, Jira keys, a date (`since 1 Nov`), `set up`, or instructions (`statuses only`). Text that asks for an action, such as `create missing tickets` or `fix PR keys`, is the user's confirmation for it. Without any text, the scope is the current user's work: their open PRs and issues, their PRs merged in the last 30 days, and their unresolved tickets in the configured project.

The Atlassian and GitHub mechanics are in [reference.md](./reference.md), the config in [config.md](./config.md), and how to write a ticket in [templates.md](./templates.md).

## 0. Load the repository's setup

1. When the repository has its own `sync-jira` skill, in `.claude/skills/`, `.github/skills/` or `.agents/skills/`, follow that file instead: it carries the repository's own rules, and this one stops here.
2. Read the config: `docs/agents/jira.md` in the repository, or else `~/.config/sync-jira/<owner>-<repo>.md` for a repository that keeps it out of git.
3. With no config, or when the text says `set up`, draft one as [config.md](./config.md) describes and show it. Save it where the user chooses once they confirm.

**Done when** the repository's own skill has taken over, or a config is loaded.

## Ground rules

- **Confirm first**: creating a ticket, editing a PR, widening a ticket's scope, any change to a ticket assigned to someone else, and saving the config, unless the text after `/sync-jira` already asked for it. Put the plan in your reply and end the turn; the user answers in chat.
- **Apply, then report**: everything else on tickets assigned to the current user, such as forward status moves, added GitHub links, a missing `How to check`, missing labels and release details. The report lists each change.
- **Forward only**: a ticket moves from the config's To Do status to its in-progress status to its testing status. A ticket in a status the config gives to others, such as QA or the PM, stays where it is; when GitHub disagrees with its status, say so in the report.
- **Complete evidence**: a ticket moves only on everything GitHub holds for it. Page every list to its end; when evidence is missing, the ticket stays where it is and the report says why.

## 1. Gather

Identify the user: `gh api user --jq .login` on GitHub, `atlassianUserInfo` in Jira.

Collect the GitHub side:

```bash
since=$(date -v-30d +%F 2>/dev/null || date -d '30 days ago' +%F)
fields=number,title,body,url,state,isDraft,baseRefName,headRefName,mergedAt,mergeCommit,closingIssuesReferences
gh pr list --author @me --state open --limit 200 --json "$fields"
gh pr list --author @me --state merged --search "merged:>=$since" --limit 200 --json "$fields"
gh issue list --assignee @me --state open --limit 200 --json number,title,url,labels,milestone
gh issue list --author @me --state open --limit 200 --json number,title,url,labels,milestone
```

With high-level tracking, also list every issue of each milestone those issues belong to: `gh issue list --milestone "<title>" --state all --limit 500 --json number,title,state,stateReason,author,assignees,labels,closedByPullRequestsReferences`.

Collect the Jira side with `searchJiraIssuesUsingJql`, paging with `nextPageToken` until `isLast`: `project = <KEY> AND assignee = currentUser() AND (statusCategory != Done OR updated >= -30d)`, asking for the summary, status, issue type, labels, parent and a markdown description. Keep the tickets whose summary starts with the config's prefix, or that carry no prefix and link this repository.

Join the two. A PR belongs to a ticket when its title or body names the key, when the ticket's description links the PR, or when the description links an issue the PR closes. Then widen each ticket's evidence to every PR that names its key, whoever opened it and whenever; the filter drops release PRs, whose notes name every key merged since the last release:

```bash
gh pr list --state all --search "<KEY> in:title,body" --limit 100 --json "$fields" --jq '[.[] | select(.headRefName | startswith("release-please--") | not)]'
```

**Done when** every PR, issue and milestone in scope carries a ticket key or `none`, and every ticket in scope lists every PR and issue tied to it.

## 2. Classify the untracked work, and audit the keys

For each item marked `none`, search the project for a ticket that already covers it, with `text ~` queries on two or three distinctive words from its title and on its GitHub number. A match is settled by the [overlap rules](./reference.md#overlap-with-a-teammates-ticket).

With **per-change** tracking, classify what is left:

- **Business**: it changes what a user, a customer or a client app sees or can do. It must have a ticket: a Story, or a Bug when it fixes a defect.
- **Technical**: invisible to users and still worth tracking, such as a refactor, hardening, security, performance or a spike. Propose a ticket and let the user decline it.
- **Maintenance**: docs, dependency bumps, CI tweaks, release PRs. It needs no ticket; list it as skipped.

With **high-level** tracking, group what is left: a milestone, or a PRD and its slices, becomes one ticket when its outcome is business-visible, and loose business issues group by theme. Technical issues stay on GitHub; list them as skipped. A ticket keeps its scope: a new issue of the user's in its milestone or theme joins it in step 4, and a teammate's goes on the plan as a scope change.

The config can change which classes get a ticket. Then audit the keys, when the config puts keys on PRs: every open PR tied to a ticket whose title or body lacks that ticket's key goes on the **PR edits** list for step 5.

**Done when** every untracked item is matched, classed or grouped, and every open PR missing its key is on the PR edits list.

## 3. Work out each ticket's status

Read the evidence on GitHub: each PR's state and merge commit, each linked issue's state, and whether each merge is on dev by the config's rule ([On dev](./reference.md#on-dev)). A PR closed without merging stops counting once another PR covers its work; while nothing does, the ticket stays where it is and the report names that PR. An issue labelled as a PRD is the umbrella over its slices: judge by the slices.

| Evidence | Status |
| --- | --- |
| No PR yet | To Do |
| A PR is open, draft or not, or a PR has merged while an issue is still open | In progress |
| Every PR merged, but a merge is not on dev yet | In progress |
| Every PR merged and on dev, and every linked issue closed as completed | Testing |

"Every PR" means the PRs that still count, and at least one of them. A move is due only when this status comes later than the ticket's current one.

**Done when** every ticket in scope has a target status and the evidence behind it.

## 4. Apply the direct changes

Work through each ticket assigned to the current user in this order, since a QA team may generate test cases from the description once a ticket reaches testing:

1. Bring the description up to date: add each PR or issue missing from its GitHub line, and give a ticket about to reach testing a `How to check`, written to [templates.md](./templates.md).
2. Add the labels the config says the ticket is missing.
3. Re-read the ticket, then transition it, through the in-progress status when it starts in To Do. A ticket whose description edit failed keeps its status.
4. Record the release its merges reached, when the config names a release tool ([Releases](./reference.md#releases)).

**Done when** each ticket's changes are applied in that order, or the error is recorded for the report.

## 5. Propose the rest, then wait

Draft each new ticket by [templates.md](./templates.md), with the config's prefix, issue type, epic and labels. Show the plan in this shape, then end the turn:

```markdown
**New tickets** (reply `go`, or name the numbers to change or drop)
1. `[<Prefix>] <Area>: <outcome>`: Story, epic <KEY>, labels <labels>, starts in <status>. From #<issue> and PR #<pr>. <one-line summary>

**PR edits**
- PR #<n>: title `feat(<KEY>): …`, and the key on the body's Jira line

**Scope changes**
- <KEY>: add #<n>, a teammate's issue new in its milestone

**Already applied**
- <KEY> → <testing status>: PR #<n> is on dev

**Skipped**
- #<n> `chore(deps): …`, maintenance
```

When the plan has no new tickets, PR edits, scope changes or changes to someone else's ticket, go straight to step 7.

**Done when** the user has answered.

## 6. Apply what the user approved

- Create each approved ticket with the config's fields ([Creating a ticket](./reference.md#creating-a-ticket)), in batches of up to five, with its description complete, and bring it to the status step 3 gave it.
- Link each new ticket to the tickets it waits on or relates to.
- Apply each approved PR edit and scope change. Check a new PR title and body against the repository's own checks before `gh pr edit` ([Keys on PRs](./reference.md#keys-on-prs)); a merged PR keeps its title, and its ticket's description links it instead.

**Done when** every approved ticket exists in its target status and every approved edit shows, or the error is recorded for the report.

## 7. Verify and report

Re-read every ticket you touched: status, sprint, epic, labels, links and assignee. Re-read every PR you edited: its title, its body, and its checks.

Report what changed, with links; what was skipped, and why; and what is left for the user, such as a ticket whose status disagrees with GitHub. When the config names who should report business tickets and the run created or found some reported by someone else, end with the bulk-change search from [Reporter](./reference.md#reporter).
