---
name: sync-jira
description: "Keep a Jira project in step with a repository's GitHub work: tickets for work that needs one, Jira keys on PRs, statuses and releases that follow each ticket's PRs, and assignees that match who does the work, by the repository's Jira config, which it sets up on first use. Run as /sync-jira, alone or with PR or issue numbers, Jira keys, a date, set up, or instructions. A full run is slow and token-heavy; naming PRs, issues or keys keeps it small."
argument-hint: "[PR/issue numbers, Jira keys, since <date>, set up, or instructions]"
disable-model-invocation: true
---

# Sync Jira

Keeps a Jira project in step with the GitHub work in the current repository: work that needs a ticket has one, each PR names its ticket, each ticket's status and release follow its PRs, and each ticket and issue is assigned to whoever does the work. How the repository maps to Jira, from the site and board to the statuses and the way a merge reaches dev, lives in a config file, so the same steps serve any repository.

Text typed after `/sync-jira` narrows or steers the run: PR or issue numbers, Jira keys, a date (`since 1 Nov`), `set up`, or instructions (`statuses only`). Text that asks for an action, such as `create missing tickets`, `fix PR keys` or `fix assignees`, is the user's confirmation for it. Without any text, the scope is the current user's work: their open PRs and issues, their PRs merged in the last 30 days, and their unresolved tickets in the configured project.

The Atlassian and GitHub mechanics are in [reference.md](./reference.md), the config in [config.md](./config.md), and how to write a ticket in [templates.md](./templates.md).

## 0. Load the repository's setup

1. Look for the repository's own `sync-jira` skill: a committed `SKILL.md` in `.claude/skills/sync-jira/`, `.github/skills/sync-jira/` or `.agents/skills/sync-jira/` (`git ls-files '*skills/sync-jira/SKILL.md'`) with no `config.md` beside it, since every copy of this skill has one. When there is one, read it and follow it from its first step, resolving its links from its own folder, such as `.claude/skills/sync-jira/reference.md`, never from this skill's: it carries the repository's own rules, and this skill stops here.
2. Read the config: `docs/agents/jira.md` in the repository, or else `~/.config/sync-jira/<owner>-<repo>.md` for a repository that keeps it out of git.
3. With no config, or when the text says `set up`, draft one as [config.md](./config.md) describes and show it. Save it where the user chooses once they confirm.

**Done when** the repository's own skill has taken over, or a config is loaded.

## Ground rules

- **Confirm first**: creating a ticket, editing a PR, widening a ticket's scope, changing an assignee in Jira or on GitHub, any change to a ticket assigned to someone else or to nobody, and saving the config, unless the text after `/sync-jira` already asked for it. Put the plan in your reply and end the turn; the user answers in chat.
- **Apply, then report**: everything else on tickets assigned to the current user, such as forward status moves, added GitHub links, a missing `How to check`, missing labels and release details. The report lists each change.
- **Forward only**: a ticket moves from the config's To Do stage, any of the statuses it lists there, to its in-progress status, then to its testing status. A ticket in a status the config gives to others, such as QA, the PM or another team, stays where it is; when GitHub disagrees with its status, say so in the report.
- **Complete evidence**: a ticket moves only on everything GitHub holds for it. Page every list to its end; when evidence is missing, the ticket stays where it is and the report says why.

## 1. Gather

Identify the user, the person both sides act for: `gh api user --jq .login` on GitHub, `atlassianUserInfo` in Jira. The defaults below, from the scope to the assignee audit, are about this person.

Every `gh` command in the run targets the config's repository, step 6's edits included, since `gh` otherwise picks a repository from the clone's remotes, which can name a fork. Start every shell with `export GH_REPO=<owner>/<repo>`, which `gh api` also follows for `{owner}/{repo}`.

Collect the GitHub side, in one shell, since later commands reuse `fields`:

```bash
export GH_REPO=<owner>/<repo>
since=$(date -v-30d +%F 2>/dev/null || date -d '30 days ago' +%F)
fields=number,title,body,url,author,state,isDraft,baseRefName,headRefName,mergedAt,mergeCommit,closingIssuesReferences
gh pr list --author @me --state open --limit 200 --json "$fields"
gh pr list --author @me --state merged --search "merged:>=$since" --limit 200 --json "$fields"
gh issue list --assignee @me --state open --limit 200 --json number,title,url,labels,milestone,assignees
gh issue list --author @me --state open --limit 200 --json number,title,url,labels,milestone,assignees
```

With high-level tracking, also list every issue of each milestone those issues belong to, passing the milestone's number from each issue's `milestone.number`, since a title must match exactly and a near-miss returns no issues rather than an error: `gh issue list --milestone <number> --state all --limit 500 --json number,title,state,stateReason,author,assignees,labels,parent,closedByPullRequestsReferences`. Skip a catch-all milestone, such as a quarterly review or a dependencies bucket: its issues are loose issues.

Collect the Jira side with `searchJiraIssuesUsingJql`, paging with `nextPageToken` until `isLast`: `project = <KEY> AND assignee = currentUser() AND (statusCategory != Done OR updated >= -30d)`, asking for the summary, status, issue type, labels, parent, assignee and a markdown description. Keep the tickets whose summary starts with the config's prefix, or that carry no prefix and link this repository. Then read, with `getJiraIssue`, each key the user's PRs name that this search did not return: its ticket belongs to someone else or to nobody, and step 2's assignee audit needs it.

Join the two. A PR belongs to a ticket when the key is in its title scope, on the body's Jira line or on the line the Jira app appends to the body (`[<KEY>]: https://…?atlOrigin=…`), when the ticket's description links the PR, or when it closes one of the ticket's issues: those its description links, plus those closed by the PRs that name its key or that its description links. With high-level tracking, a PR that names one of the ticket's issues without closing it, by the repository's convention, belongs too: often a `Refs` line, `Refs #<n>` or `Refs: #<n>`, which can list several issues, as in `- Refs: #854, #986`. Only links into this repository count; a link into another repository is context.

Then complete each ticket's evidence past the user's own recent PRs, whoever opened a PR and whenever, since a PR left out can move a ticket too early:

1. **PRs its description links**: read each with `gh pr view <n> --json "$fields"`.
2. **PRs that close its issues**: its issues include every one its `GitHub issue inventory` links. A count or a range on a GitHub line in place of links, such as `from #544 to #647`, identifies only the issues it links: the ones between join only when the ticket's PRs close them, and while fewer join than the count, the ticket's evidence is incomplete, so it keeps its status and gets no release, and the report names the gap. For each of its issues, the milestone listing above or `gh issue view <n> --json state,stateReason,parent,closedByPullRequestsReferences` gives, by number, every PR that closes it or will on merge, open, merged or closed without merging; read each one not read yet with `gh pr view`. Such a PR counts for the ticket, while the other issues it closes stay out of it.
3. **PRs that name its key, or with high-level tracking its issues**: the searches below, whose filters drop release PRs, since their notes name every key merged since the last release. The key search also matches a key mentioned in passing, so it only finds candidates: keep the PRs that name the key in the places above. The issue search keeps only the PRs whose `Refs` line names `#<n>`; change its pattern when the repository marks the link another way:

   ```bash
   gh pr list --state all --search "<KEY> in:title,body" --limit 100 --json "$fields" --jq '[.[] | select(.headRefName | startswith("release-please--") | not)]'
   gh pr list --state all --search "<n> in:body" --limit 100 --json "$fields" --jq '[.[] | select((.headRefName | startswith("release-please--") | not) and ((.body // "") | test("(^|\\n)[ \\t>*-]*Refs:?[ \\t]+([^\\n]*[ \\t,])?#<n>([^0-9]|$)"; "i")))]'
   ```

**Done when** every PR, issue and milestone in scope carries a ticket key or `none`, and every ticket in scope lists every PR and issue tied to it, whoever opened them and whenever, each with its state.

## 2. Classify the untracked work, and audit keys and assignees

For each item marked `none`, search the project for a ticket that already covers it, with `text ~` queries on two or three distinctive words from its title and on its GitHub number. A match is settled by the [overlap rules](./reference.md#overlap-with-a-teammates-ticket).

With **per-change** tracking, classify what is left:

- **Business**: it changes what a user, a customer or a client app sees or can do. It must have a ticket: a Story, or a Bug when it fixes a defect.
- **Technical**: invisible to users and still worth tracking, such as a refactor, hardening, security, performance or a spike. Propose a ticket and let the user decline it.
- **Maintenance**: docs, dependency bumps, CI tweaks, release PRs. It needs no ticket; list it as skipped.

With **high-level** tracking, group what is left: a milestone, or a PRD and its slices, becomes one ticket when its outcome is business-visible, and loose business issues group by theme. Technical issues stay on GitHub; list them as skipped. A ticket keeps its scope: a new issue of the user's in its milestone or theme joins it in step 4, and a teammate's goes on the plan as a scope change.

The config can change which classes get a ticket. Then audit the keys, when the config puts keys on PRs: every open PR tied to a ticket goes on the **PR edits** list for step 5 when its title scope holds none of its tickets' keys, or its body's Jira line misses any of them. A title holds one key, so a PR tied to two tickets passes with either key in its title and both on its Jira line.

Then audit the assignees. Whoever does a ticket's work, the author of its PRs or, before the first PR, the assignee of its issues, should be its Jira assignee and the GitHub assignee of its issues; a high-level ticket stays the user's while teammates hold some of its issues. By default only a mismatch that involves the user counts: the user's PR under a ticket that is unassigned or assigned to someone else, an issue under the user's ticket that is unassigned or assigned to someone else on GitHub, unless the user approved it as a teammate's part, or an issue assigned to the user under someone else's ticket. Closed issues are left out, since nobody works on them any more. Each goes on the **Assignees** list for step 5, with the fix [Assignees](./reference.md#assignees) gives. Other people's mismatches count only when the text asks.

**Done when** every untracked item is matched, classed or grouped, every open PR missing a key is on the PR edits list, and every assignee mismatch in scope is on the Assignees list.

## 3. Work out each ticket's status

Read the evidence on GitHub: each PR's state and its [merge into `main`](./reference.md#merges-into-main), the state and `stateReason` of each of the ticket's issues, and whether each merge is on dev by the config's rule ([On dev](./reference.md#on-dev)). A [hotfix](./reference.md#hotfixes), a PR based on a release branch, never reaches `main` itself: it is on dev once its counterpart into `main` is. A PR closed without merging stops counting once another PR covers its work; while nothing does, the ticket stays where it is and the report names that PR. An issue with sub-issues, such as a PRD, is the umbrella over them: judge it by the issues whose `parent` it is, whatever its labels. An issue closed as not planned leaves the ticket's list; say so in the report.

| Evidence | Status |
| --- | --- |
| No PR yet | To Do |
| A PR is open, draft or not, or a PR has merged while an issue is still open | In progress |
| Every PR merged, but a merge is not on dev yet | In progress |
| Every PR merged and on dev, and every one of its issues closed as completed | Testing |

"Every PR" means the PRs that still count, and at least one of them. A move is due only when this status comes later than the ticket's current one.

**Done when** every ticket in scope has a target status and the evidence behind it.

## 4. Apply the direct changes

Work through each ticket assigned to the current user in this order, since a QA team may generate test cases from the description once a ticket reaches testing:

1. Bring the description up to date, changing only what this step adds ([Editing a ticket](./reference.md#editing-a-ticket)): add each PR or issue missing from its GitHub line, with more than ten findings from one scanner as a count there and a link each in the `GitHub issue inventory`, from which no edit drops an issue ([templates.md](./templates.md#writing-rules)), and give a ticket about to reach testing a `How to check`, written to [templates.md](./templates.md).
2. Add the labels the config says the ticket is missing, sending its current labels with them, since `editJiraIssue` sets the whole list.
3. Re-read the ticket, then transition it, through the in-progress status when it starts in the To Do stage. A ticket whose description edit failed keeps its status.
4. Record its release once its work is complete, when the config names a release tool ([Releases](./reference.md#releases)).

A ticket assigned to someone else or to nobody gets none of these changes here: step 5 proposes them.

**Done when** each ticket's changes are applied in that order, or the error is recorded for the report.

## 5. Propose the rest, then wait

Anything the text after `/sync-jira` already approved is applied now, as step 6 describes, and listed under **Already applied**. Draft each new ticket by [templates.md](./templates.md), with the config's prefix, issue type, epic and labels. For each ticket in scope assigned to someone else or to nobody, list the changes step 4 would make to it. Show the plan in this shape, then end the turn. Number every item that needs the user's answer from 1, across all its sections, so one reply such as `go` or `go, drop 3` settles them all. The decisions come first and what is already applied after them, and the waiting line opens and closes the plan, so the request is the first and the last thing in the reply:

```markdown
> ⏸️ **Waiting for your answer: 6 items.** Reply `go` to apply them all, or name the numbers to change or drop, such as `go, drop 3`.

**New tickets**
1. `[<Prefix>] <Area>: <outcome>`: Story, epic <KEY>, labels <labels>, starts in <status>. From #<issue> and PR #<pr>. <one-line summary>

**PR edits**
2. PR #<n>: title `feat(<KEY>): …`, and the key on the body's Jira line

**Scope changes**
3. <KEY>: add #<n>, a teammate's issue new in its milestone

**Assignees**
4. <KEY>: assigned to <name>, but its work is your PR #<n>: assign it to you
5. #<n>: unassigned on GitHub, under your <KEY>: assign it to you

**Tickets not assigned to you**
6. <KEY>, assigned to <name>: → <testing status>, since PR #<n> is on dev; add PR #<n> to its GitHub line

---

**Already applied**
- <KEY> → <testing status>: PR #<n> is on dev

**Skipped**
- #<n> `chore(deps): …`, maintenance

> ⏸️ **Waiting for your answer on items 1 to 6.** Reply `go`, or name the numbers to change or drop.
```

When the plan has no new tickets, PR edits, scope changes, assignee changes or changes to tickets not assigned to the user, go straight to step 7.

The plan stays open until the user answers it. When their next message is about something else, handle that, and start the reply, and every later one in the session, with the waiting line, until the user answers the plan or drops it.

**Done when** the user has answered.

## 6. Apply what the user approved

- Create each approved ticket with the config's fields ([Creating a ticket](./reference.md#creating-a-ticket)), in batches of up to five, with its description complete, and bring it to the status step 3 gave it.
- Link each new ticket to the tickets it waits on or relates to.
- Apply each approved PR edit and scope change. Check a new PR title and body against the repository's own checks before `gh pr edit` ([Keys on PRs](./reference.md#keys-on-prs)); a merged PR keeps its title, and its ticket's description links it instead.
- Apply each approved assignee change, in Jira or on GitHub, as [Assignees](./reference.md#assignees) shows.
- Apply each approved change to a ticket not assigned to the user in step 4's order, whether or not its assignee changes. A ticket that an approved assignee change gives to the user gets step 4's changes the same way.

**Done when** every approved ticket exists in its target status and every approved edit, assignee change and change to another ticket shows, or the error is recorded for the report.

## 7. Verify and report

Re-read every ticket you touched: status, sprint, epic, labels, links and assignee. Re-read every PR you edited: its title, its body, and its checks. Re-read the assignees of every issue you changed.

Report what is left for the user first, such as a ticket whose status disagrees with GitHub, then what changed, with links, and what was skipped, and why. When the config names who should report business tickets and the run created or found some that the user reported, end with the bulk-change search from [Reporter](./reference.md#reporter).
