# The Jira config

`/sync-jira` reads how a repository maps to Jira from `docs/agents/jira.md` in that repository, where teammates share it, or from `~/.config/sync-jira/<owner>-<repo>.md` when the repository should not carry it. A config is plain Markdown in the shape below; the agent reads it, so no field needs a parser's exact syntax.

## Setting one up

Fill in every field from evidence, then show the draft to the user and save it where they choose once they confirm.

1. **The repository.** Read its PR template (is there a Jira line?), its PR title check (does the scope take a ticket key?), how `main` reaches dev (a deploy workflow, a GitOps values file holding an image tag, a GitHub deployment environment), and its release tool (release-please and its tag prefix, or tags made by hand).
2. **Jira.** `getAccessibleAtlassianResources` gives the site and its cloudId. For the project, read a few recent tickets of the user's: their epics, labels and Sprint field (each sprint entry names its `boardId`). `getJiraIssueTypeMetaWithField` gives each issue type's required fields, and `getTransitionsForJiraIssue` on a ticket of each type gives the workflow. Survey the labels in use with a search over recent tickets, setting aside those a QA automation writes onto test cases.
3. **The user.** Ask only for what evidence cannot settle: the title prefix, the tracking mode, which work needs a ticket, and who should report business tickets.

## Template

```markdown
# Jira

Read by the `sync-jira` skill.

- **Site**: <name>.atlassian.net, cloudId `<uuid>`
- **Project**: `<KEY>`, board <id>: <board URL>
- **Tracking**: per-change, a ticket for each piece of work that needs one | high-level, one business ticket per milestone, PRD or theme
- **Title prefix**: `[<Prefix>]`, as in `[<Prefix>] <Area>: <outcome>`
- **Which work gets a ticket**: business always, technical when the user agrees, maintenance never
- **Issue types**: Story for user-visible work, Bug for a defect, Task for technical work, Spike for a decision, Sub-task under a parent Task
- **Epics**: `<EPIC-KEY>` for <the work it holds>
- **Required fields**: `<field id>` = `<value>`, with the option's name
- **Sprint**: field `<customfield id>`, the active sprint of board <id>; match the board id, never the sprint name
- **Labels**: `<label>` on <which tickets>; leave alone: <labels an automation or another team owns>
- **Statuses**: To Do = `<name>`; in progress = `<name>` (transition <id>); testing = `<name>` (transition <id>); owned by others = `<names>`
- **On dev**: <how to tell a merge is on dev, such as "the sha in `charts/app/values-dev.yaml`'s image tag contains the merge commit">
- **Releases**: <tool, tag prefix, the workflow that deploys a tag to production>; Jira versions named like `<Component> <version>`
- **Keys on PRs**: <where a key goes in a PR title and body, and the check that enforces it>, or none
- **Reporter**: business tickets should be reported by <name>; the tools cannot set it
- **Assignee**: the user running the sync
```
