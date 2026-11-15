# Atlassian and GitHub mechanics

The facts `/sync-jira` relies on whatever the repository. The repository's values, such as ids, names and paths, come from its [config](./config.md).

## Atlassian tools

The Atlassian MCP server provides the Jira tools, under a client-specific prefix such as `com-atlassian-atlassian-mcp-server-` or `mcp__atlassian__`. A run uses `atlassianUserInfo`, `getAccessibleAtlassianResources`, `searchJiraIssuesUsingJql`, `getJiraIssue`, `getJiraIssueTypeMetaWithField`, `getTransitionsForJiraIssue`, `transitionJiraIssue`, `createJiraIssue`, `editJiraIssue`, `createIssueLink`, `addCommentToJiraIssue` and `lookupJiraAccountId`. A client that defers tools loads them through its tool search by exact name. When none of them loads, stop and ask the user to connect the Atlassian MCP server: GitHub alone cannot sync anything.

Every call takes the config's cloudId. Ask searches for only the fields you need, read descriptions with `responseContentFormat: markdown`, and page each search with `nextPageToken` until `isLast` is true.

## Creating a ticket

`createJiraIssue` with the project key, the issue type, the epic as `parent` (a Sub-task's parent is its Task), the current user's account id as `assignee_account_id`, `contentFormat: markdown`, and in `additional_fields` the config's required fields, its sprint field and its labels. A Sub-task takes its parent's sprint, so leave the sprint field off.

- **Active sprint**: search `project = <KEY> AND sprint in openSprints()` for the sprint field, paging until an entry has the config's `boardId` and `state` `active`, and use its `id` as a number. Other boards may run sprints with similar names at the same time, so match the board id, never the name.
- **Starting status**: `transition` with the in-progress transition id starts the ticket there; without it, the ticket starts in To Do.
- **Already on dev**: create the ticket with its complete description, `How to check` included, and the in-progress transition, then `transitionJiraIssue` to testing. Re-read its status before reporting it.
- **Rate limit**: about a dozen creates at once can answer HTTP 429 and create nothing; batches of up to five go through. After any failed create, search `project = <KEY> AND reporter = currentUser() AND created >= -1h` before retrying, so a retry never duplicates a ticket.

## Workflow

Choose each transition by its target status in `getTransitionsForJiraIssue`; the config's ids are hints that can change. Spikes and Bugs often run their own workflow, with other ids for the same statuses.

## Links

`createIssueLink` reads as "`inwardIssue` <outward verb> `outwardIssue`": type `Blocks` with `inwardIssue` A and `outwardIssue` B records "A blocks B". Check the result once on the ticket: the direction is easy to invert.

### Overlap with a teammate's ticket

- **The same work**, ticketed but unassigned or assigned to someone else while the user does it: propose assigning that ticket to the user, in place of a new one.
- **Another team's part** of the same feature: the user gets a ticket for their own part, linked to the other team's. Use `blocks` when the other team waits on it, `relates to` otherwise, so the dependency shows without a duplicate.

## Reporter

Reporter is usually missing from the create and edit screens for anyone without the Modify Reporter permission, so the tools cannot set it. When the config names who should report business tickets, the report ends with a search that person can bulk-change, by selecting all, then Bulk change, Edit Issues and Change Reporter:

```text
https://<site>/issues/?jql=<URL-encoded: key in (<business keys>) AND reporter != <account id> ORDER BY key ASC>
```

`lookupJiraAccountId` with their name gives the account id.

## On dev

The config says how a merge reaches dev. The common shapes:

- **A GitOps values file** holding the deployed image tag, such as `tag: main-<app>-<sha>`. A merge is on dev once its merge commit is an ancestor of that sha:

  ```bash
  deployed=$(gh api 'repos/{owner}/{repo}/contents/<values file>' --jq .content | base64 --decode | sed -nE "s/^[[:space:]]*tag:[[:space:]]*['\"]?main-<app>-([0-9a-f]+)['\"]?.*/\1/p")
  gh api "repos/{owner}/{repo}/compare/<merge-commit-sha>...$deployed" --jq .status   # ahead or identical: on dev
  ```

- **GitHub deployments**: take the newest successful deployment to the dev environment (`gh api 'repos/{owner}/{repo}/deployments?environment=<env>'`, then its statuses) and compare its sha the same way.
- **A deploy workflow on `main`**: take the newest successful run (`gh run list --workflow <file> --branch main --status success --limit 1 --json headSha`) and compare its `headSha`.

Two traps apply to all of them. A **stacked PR**, merged into another PR's branch, compares as `diverged`, since its changes reached `main` inside the PR whose head branch is its base: find that PR with `gh pr list --state merged --head <baseRefName>` and check its merge commit instead. And a merge whose paths the deploy ignores, such as docs, reaches dev only with the next merge that deploys.

## Releases

With release-please, every merge to `main` joins the open release PR, whose head branch starts with `release-please--` and whose title ends with the next version. Merging that PR tags the release, and the tag usually deploys production. A ticket's release is the one holding the last merge behind it:

```bash
git fetch -q --tags origin
git tag --contains <merge-commit-sha> --list '<tag prefix>*' --sort=version:refname | head -1   # empty while pending
gh pr list --state open --search "head:release-please--" --json title --jq '.[].title'          # pending version: the title's last word
gh release view <tag> --json name,publishedAt,url
gh run list --workflow <production workflow> --limit 20 --json headBranch,conclusion --jq '.[] | select(.headBranch == "<tag>")'
```

In Jira:

- **Fix version**: when the project has a version for the release, named as the config says, add it to the ticket's `fixVersions`, pending or released. Setting the field replaces it, so send the ticket's current versions plus this one. When none matches, the report says so once per release; versions usually need a project admin.
- **Release comment**: once the tag exists and its production run succeeded, add one comment, unless the ticket already carries it: `Released to production in <Component> <version> (<release name>) on <d Mon yyyy>: <release URL>`. A release whose production run failed has not reached production.

## Keys on PRs

- Most title checks allow one key, in capitals, in the Conventional Commits scope: `feat(<KEY>): …`. Read the repository's check and validate a new title against it before `gh pr edit`; a second key belongs in the body.
- The body names every key where the PR template puts it, often a `Jira Ticket:` line under Metadata.
- Jira Cloud for GitHub links a PR to the key in its title, and can append a `[<KEY>]: https://…?atlOrigin=…` line to the body. Re-read the body just before editing it, and keep that line.
- Release PRs list every merged PR's title, so a search for a key finds them too: filter out head branches starting with `release-please--`.
- Every edit re-runs the PR checks. A run cancelled with "higher priority waiting request" lost to a newer run rather than failing; `gh run rerun <id>` settles it.
