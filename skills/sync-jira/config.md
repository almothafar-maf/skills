# The Jira config

`/sync-jira` reads how a repository maps to Jira from `docs/agents/jira.md` in that repository, where teammates share it, or from `~/.config/sync-jira/<owner>-<repo>.md` when the repository should not carry it. A config is plain Markdown in the shape below; the agent reads it, so no field needs a parser's exact syntax.

## Setting one up

Fill in every field from evidence, then show the draft to the user and save it where they choose once they confirm.

1. **The repository.** Its `owner/name` on GitHub, the parent when the clone's `origin` is a fork (`gh repo view --json nameWithOwner,parent`). Read its PR template (is there a Jira line?), its PR title check (does the scope take a ticket key?), how `main` reaches dev and what shows the rollout finished healthy (a deploy workflow step that waits on ArgoCD or Kubernetes, GitHub deployment statuses, the service's own version endpoint), and its release tool (release-please and its tag prefix, or tags made by hand), including whether urgent fixes ship from release branches.
2. **Jira.** `getAccessibleAtlassianResources` gives the site and its cloudId. For the project, read a few recent tickets of the user's: their epics, labels and Sprint field (each sprint entry names its `boardId`). `getJiraIssueTypeMetaWithFields` gives each issue type's required fields, and `listJiraIssueTransitions` on a ticket of each type, and on one in each status of the To Do stage, gives the workflow. Survey the labels in use with a search over recent tickets, setting aside those a QA automation writes onto test cases.
3. **The user.** Ask only for what evidence cannot settle: the title prefix, the tracking mode, which work needs a ticket, and who should report business tickets.

## Template

```markdown
# Jira

Read by the `sync-jira` skill.

- **Repository**: `<owner>/<repo>` on GitHub; every `gh` command targets it through `GH_REPO`, whatever the clone's remotes
- **Site**: <name>.atlassian.net, cloudId `<uuid>`
- **Project**: `<KEY>`, board <id>: <board URL>
- **Tracking**: per-change, a ticket for each piece of work that needs one | high-level, one business ticket per milestone, PRD or theme
- **Title prefix**: `[<Prefix>]`, as in `[<Prefix>] <Area>: <outcome>`
- **Which work gets a ticket**: business always, technical when the user agrees, maintenance never
- **Issue types**: Story for user-visible work, Bug for a defect, Task for technical work, Spike for a decision, Sub-task under a parent Task
- **Epics**: `<EPIC-KEY>` for <the work it holds>
- **Required fields**: `<field id>` = `<value>`, with the option's name
- **Sprint**: field `<customfield id>`, the active sprint of board <id>, or its next future sprint when none of its own is active; match the board id, never the sprint name
- **Labels**: `<label>` on <which tickets>; leave alone: <labels an automation or another team owns>
- **Statuses**: To Do stage = `<names>`, every status in Jira's To Do category, such as To Do and Ready for Development; in progress = `<name>` (transition <id>, or <id> from `<status>` where a To Do-stage status has its own); testing = `<name>` (transition <id>); owned by others = `<names>`, such as QA's and other teams' statuses
- **On dev**: <the evidence that dev runs a merge, healthy, such as "the newest successful run of `deploy-dev.yml`, whose `Wait for rollout` step passed, holds the merge"; an image tag in a values file shows only what dev should run>
- **Releases**: <tool, tag prefix, the workflow that deploys a tag to production, and the release branches hotfixes merge into, such as `release/*`, if any>; Jira versions named like `<Component> <version>`
- **Keys on PRs**: <where a key goes in a PR title and body, and the check that enforces it>, or none
- **Reporter**: business tickets should be reported by <name>; the tools cannot set it
- **Assignee**: new tickets go to the user running the sync
- **People** (optional): `<GitHub login>` = `<Jira account id>`, for anyone `lookupJiraAccountId` cannot find by the name on their GitHub profile
```
