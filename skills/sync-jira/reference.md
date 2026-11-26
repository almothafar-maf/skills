# Atlassian and GitHub mechanics

The facts `/sync-jira` relies on whatever the repository. The repository's values, such as ids, names and paths, come from its [config](./config.md).

## Atlassian tools

The Atlassian MCP server at `https://mcp.atlassian.com/v2/mcp?tools=all` provides the Jira tools, under a client-specific prefix such as `com-atlassian-atlassian-mcp-server-` or `mcp__atlassian__`; `?tools=all` makes it list every tool by name. A run uses `atlassianUserInfo`, `getAccessibleAtlassianResources`, `searchJiraIssuesUsingJql`, `getJiraIssue`, `getJiraIssueTypeMetaWithFields`, `listJiraBoardSprints`, `listJiraIssueTransitions`, `transitionJiraIssue`, `createJiraIssue`, `editJiraIssue`, `createJiraIssueLink`, `addOrEditJiraIssueComment` and `lookupJiraAccountId`. A client that defers tools loads them through its tool search by name. Some clients cut a tool's id at 64 characters, prefix included, so any long name can load cut short, such as `getJiraIssueTypeMetaWithFields` as `com-atlassian-atlassian-mcp-server-getJiraIssueTypeMetaWithField` or `getAccessibleAtlassianResources` as `…-getAccessibleAtlassianResourc`: an id that ends in the first part of a tool's name is that tool. Before the first Jira call, check that every one of these tools loads. When any is missing, stop and ask the user to connect the server at that address and sign in: the `v1/mcp` address names some of these tools differently, and GitHub alone cannot sync anything.

Every call takes the config's cloudId. Ask searches for only the fields you need, read descriptions with `responseContentFormat: markdown`, and page each search with `nextPageToken` until `isLast` is true.

## Creating a ticket

`createJiraIssue` with the project key as `projectKey`, the issue type as `issueType`, the epic as `parent` (a Sub-task's parent is its Task), the current user's account id as `assignee`, `contentFormat: markdown`, the config's labels as `labels`, the sprint's id as `assignToSprint`, and the config's required fields in `additional_fields`. A Sub-task takes its parent's sprint, so leave `assignToSprint` off.

- **Sprint**: `listJiraBoardSprints` for the config's board with `state` `active` lists every sprint running on the board, including other boards' sprints that share its tickets, so keep the one whose `originBoardId` is the config's board. When none is, use the first sprint that `state` `future` lists with that `originBoardId`, the next one the team starts. Other boards may run sprints with the same names at the same time, so match the board id, never the name. A response with `sprintAssignment.assigned: false` still created the ticket: set its sprint with `transitionJiraIssue`'s `sprintId` instead of creating it again.
- **Starting status**: a new ticket starts in To Do; `transitionJiraIssue` with the in-progress transition's id as `transitionId` moves it on after the create.
- **Already on dev**: create the ticket with its complete description, `How to check` included, then `transitionJiraIssue` to the in-progress status and on to testing. Re-read its status before reporting it.
- **Rate limit**: about a dozen creates at once can answer HTTP 429 and create nothing; batches of up to five go through. After any failed create, search `project = <KEY> AND reporter = currentUser() AND created >= -1h` before retrying, so a retry never duplicates a ticket.

## Editing a ticket

`editJiraIssue` sets each field it sends in `fields`, replacing the ticket's value. Read the ticket first, then send `labels` and `fixVersions` as its current list plus the new entries, and `description` as the whole description with only the intended lines changed. `assignee` takes `{"accountId": "<id>"}`.

## Workflow

Choose each transition by its target status in `listJiraIssueTransitions`, and pass its id to `transitionJiraIssue` as `transitionId`; the config's ids are hints that can change. Spikes and Bugs often run their own workflow, with other ids for the same statuses, and each status of the To Do stage can reach the in-progress status through its own transition.

## Links

`createJiraIssueLink` reads as "`inwardIssue` <outward verb> `outwardIssue`": `linkType` `Blocks` with `inwardIssue` A and `outwardIssue` B records "A blocks B". Check the result once on the ticket: the direction is easy to invert.

### Overlap with a teammate's ticket

- **The same work**, ticketed but unassigned or assigned to someone else while the user does it: propose assigning that ticket to the user, in place of a new one.
- **Another team's part** of the same feature: the user gets a ticket for their own part, linked to the other team's. Use `blocks` when the other team waits on it, `relates to` otherwise, so the dependency shows without a duplicate.

## Assignees

The user's accounts come from `gh api user --jq .login` and `atlassianUserInfo`. Anyone else's Jira account comes from the config's people list, or else from `lookupJiraAccountId` with the name on their GitHub profile, `gh api users/<login> --jq .name`; use it only when exactly one account matches, and otherwise report the mismatch without a fix.

| Mismatch | Fix to propose |
| --- | --- |
| The user's PR under a ticket that is unassigned or assigned to someone else | Assign the ticket to the user when the PR is its work; when the PR is only the user's part, a ticket of their own, as the [overlap rules](#overlap-with-a-teammates-ticket) say |
| An issue under the user's ticket, unassigned on GitHub | Assign the issue to the user |
| An issue under the user's ticket, assigned to someone else on GitHub | Ask which holds: the ticket goes to that person, the issue leaves the ticket, or, with high-level tracking, it stays as the teammate's part |
| An issue assigned to the user, under someone else's ticket | Assign the ticket to the user, or give the user a ticket of their own for their part |

In Jira, `editJiraIssue` with `fields: {"assignee": {"accountId": "<id>"}}`. On GitHub, `gh issue edit <n> --add-assignee <login>`, with `--remove-assignee <login>` only for the person the approved fix replaces.

## Reporter

Reporter is usually missing from the create and edit screens for anyone without the Modify Reporter permission, so the tools cannot set it. When the config names who should report business tickets, the report ends with a search that person can bulk-change, by selecting all, then Bulk change, Edit Issues and Change Reporter. It lists only the user's own tickets, raised on that person's behalf; a ticket someone else reported keeps its reporter:

```text
https://<site>/issues/?jql=<URL-encoded: key in (<business keys>) AND reporter = <the user's account id> ORDER BY key ASC>
```

`lookupJiraAccountId` with their name gives the account id.

## Merges into main

[On dev](#on-dev) and [Releases](#releases) both start from the commit that brought a PR's work into `main`. For a PR based on `main`, that is its merge commit. A PR based on a release branch, which the config's Releases line names, such as `release/*`, is a [hotfix](#hotfixes). A PR based on any other branch is a **stacked PR**, merged into another PR's branch: it reaches `main` only inside the carrying PR, whose head branch is the stacked PR's base, and with squash or rebase merges, the stacked PR's own merge commit never appears on `main`. Take the carrying PR's merge commit instead, following the chain until a PR's base is `main`. The carrying PR is the one with that head branch that merged after the stacked PR did, or is still open:

```bash
gh pr list --state all --head <baseRefName> --json number,state,baseRefName,mergedAt,mergeCommit
```

While the carrying PR is open, the work has not reached `main`. When no PR carries it, or the carrying PR closed without merging or merged before the stacked PR did, the work never reached `main` through it: the ticket stays where it is and the report names the stacked PR.

### Hotfixes

Some repositories ship an urgent fix outside the normal release. Its PR merges into a release branch cut from a release tag, and a tag cut on that branch ships it to production. The same change reaches `main` through a separate PR, its **counterpart**, which can merge before or after it. A counterpart makes the same change, so it usually shares the hotfix's title or one of the two links the other; when none of that settles which PR it is, compare the two with `gh pr diff`.

- **On dev**: the hotfix's own merge never reaches dev. It is on dev once its counterpart's merge into `main` is, and while the ticket holds no merged counterpart, the report names the hotfix as missing from `main`, since the next release from `main` would ship without it.
- **Release**: the first tag holding the hotfix's own merge commit, found as [Releases](#releases) finds any release. Its counterpart adds no release of its own, since its change reached production with the hotfix.

## On dev

A merge is on dev once dev runs a build that holds it, healthy. A commit that only names the build dev should run, such as an image tag written into a GitOps values file, is not that evidence: the rollout can still be pending, or fail. The config names the evidence the repository has; the common shapes:

- **A deploy workflow that waits for the rollout**, with a step that runs `argocd app wait` or `kubectl rollout status` after writing the tag. Take the newest successful run on `main`, check that its waiting step passed, and compare its `headSha`:

  ```bash
  run=$(gh run list --workflow <file> --branch main --status success --limit 1 --json databaseId --jq '.[0].databaseId')
  gh run view "$run" --json headSha,jobs --jq '{headSha, waited: [.jobs[].steps[] | select(.name == "<waiting step>") | .conclusion]}'   # waited ["success"]
  gh api "repos/{owner}/{repo}/compare/<merge-into-main-sha>...<headSha>" --jq .status                                                      # ahead or identical: on dev
  ```

- **GitHub deployments** whose status a rollout check sets: take the newest deployment to the dev environment whose latest status is `success` (`gh api 'repos/{owner}/{repo}/deployments?environment=<env>'`, then its statuses), and compare its `sha` the same way.
- **The service's own report**: a health or info endpoint on dev that returns the commit it runs, when the agent can reach it.

A merge whose paths the deploy ignores, such as docs, reaches dev only with the next merge that deploys, and a [hotfix](#hotfixes) is on dev once its counterpart is. When the config's evidence cannot be read, or shows no healthy rollout, dev's state is unknown: no merge counts as on dev, every ticket keeps its status, and the report says why.

## Releases

With release-please, every merge to `main` joins the open release PR, whose head branch starts with `release-please--` and whose title ends with the next version. Merging that PR tags the release, and the tag usually deploys production.

```bash
git fetch -q --tags https://github.com/<owner>/<repo>.git main
git tag --contains <sha> --list '<tag prefix>*' --sort=version:refname                   # releases holding a merge into main or a hotfix's merge, oldest first; none while pending
gh pr list --state open --search "head:release-please--" --json title --jq '.[].title'   # pending version: the title's last word
gh release view <tag> --json name,publishedAt,url
gh run list --workflow <production workflow> --limit 20 --json headBranch,conclusion --jq '.[] | select(.headBranch == "<tag>")'
```

The fetch reads the tags from the config's repository by URL, since a clone's `origin` can be a fork without them.

A ticket has a release only once its work is complete: every PR that counts has merged, at least one, and every one of its issues is closed. While any of it is outstanding, such as a slice with no merged PR yet, the ticket gets no Fix version and no release comment, and the report lists the releases its merged PRs reached as partial progress. A complete ticket's release is the latest of its PRs' releases. A PR's release is the first release holding its [merge into `main`](#merges-into-main), or the pending version until that release is tagged; the pending version can still change, since release-please raises it when a later merge needs a bigger bump, such as a `feat` after only fixes. A [hotfix](#hotfixes) has the first release holding its own merge commit instead, and none until that tag exists, and its counterpart adds none. A release reached production when its production run succeeded; when the ticket's release failed there, its work reached production with the first later release that holds it and whose run succeeded.

In Jira:

- **Fix version**: when the project has a version for the ticket's release, named as the config says, the ticket carries it, pending or released, and no other version of this component: replace one left from an earlier pending version, and keep the ticket's other versions, as [Editing a ticket](#editing-a-ticket) says. When none matches, the report says so once per release; versions usually need a project admin.
- **Release comment**: once the ticket's work has reached production, add one comment, unless the ticket already carries it: `Released to production in <Component> <version> (<release name>) on <d Mon yyyy>: <release URL>`, naming the release that took it there.

## Keys on PRs

- Most title checks allow one key, in capitals, in the Conventional Commits scope: `feat(<KEY>): …`. Read the repository's check and validate a new title against it before `gh pr edit`; a second key belongs in the body.
- The body names every key where the PR template puts it, often a `Jira Ticket:` line under Metadata.
- Jira Cloud for GitHub links a PR to the key in its title, and can append a `[<KEY>]: https://…?atlOrigin=…` line to the body. Re-read the body just before editing it, and keep that line.
- Release PRs list every merged PR's title, so a search for a key finds them too: filter out head branches starting with `release-please--`.
- Every edit re-runs the PR checks. A run cancelled with "higher priority waiting request" lost to a newer run rather than failing; `gh run rerun <id>` settles it.
