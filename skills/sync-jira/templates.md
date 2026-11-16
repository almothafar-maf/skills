# Ticket templates

How a ticket reads. Tickets in most projects vary: a bug report with current and expected behaviour side by side is the model, and a ticket with no description is the failure to avoid. A QA team may turn descriptions into test cases, so every ticket says what to check.

A Jira-side template wins when the project has one: `getJiraIssueTypeMetaWithField` for the issue type then shows the Description field with a default value. Until then, use these.

## Writing rules

- **Title**: `[<Prefix>] <Area>: <outcome in plain words>` for a Story, Task or Spike. A Bug's title names the problem as the user meets it, with the environment when only one has it: `[<Prefix>] <Area>: <what goes wrong> (prod)`.
- **Plain words**: what the user, customer or client app sees, never class or field names alone. The detail stays on GitHub, and the ticket links it.
- **Evidence without secrets or identities**: a request, response or log keeps its shape and loses its API keys, tokens and cookies, and every value that identifies a person or a client, such as a name, an email, a phone number, or a user, member or client id. A placeholder such as `<user-id>` takes each one's place.
- **Only what applies**: a section with nothing to say is left out, never filled with "N/A".

## Per-change tracking

### Story

For a change users or client apps can see.

```markdown
<Who> can <do what>, so that <why>. <One or two sentences of context.>

**Acceptance criteria**
- <one checkable behaviour per line>

**How to check:** <the steps on dev, with the data to use>. Until the work is on dev, add "(once on dev)".

**Out of scope:** <what this leaves out on purpose>

**Depends on:** <the tickets it waits on>

**GitHub (<repo>):** issue [#N](<url>), PR [#M](<url>) (in review, or merged <d Mon yyyy>)
```

### Bug

For a defect, when no reported ticket covers it already.

```markdown
**Current behaviour:** <what happens, and where>

**Expected behaviour:** <what should happen>

**Steps to reproduce**
1. <step>

**Where:** <environment, tenant or store, page or endpoint>

**Evidence:** <request and response, log line or screenshot, with secrets and identifying values replaced by placeholders>

**Fix:** <one line, once known>

**How to check:** <the steps on dev that show it fixed>

**GitHub (<repo>):** <links, as for a Story>
```

### Task

For technical work. A Sub-task uses it too, shorter.

```markdown
<Why: the problem or the risk, in one or two sentences.>

**What changes**
- <one change per line>

**How to check:** <what QA can see on dev; with no visible change, "No visible change" and the areas to regression-check>

**GitHub (<repo>):** <links, as for a Story>
```

### Spike

For a decision or an investigation.

```markdown
**Question:** <the decision to make>

**Options:** <the known options, one per line>

**Timebox:** <days>

**Outcome:** <the decision, and where it is recorded; filled in when the spike ends>

**GitHub (<repo>):** <links, as for a Story>
```

## High-level tracking

One Story per body of business work, for readers who cannot open GitHub: two to four bullets of scope for the whole, never one per issue.

```markdown
<Who> can <do what>, so that <why>, in a paragraph of plain words.

* **<Part>:** <what it adds>
* **<Part>:** <what it adds>

**Acceptance criteria**
- <one business-visible behaviour per line>

**How to check:** <what QA or the PM can see on dev, for the ticket as a whole>. Until the work is on dev, add "(once on dev)".

**Depends on:** <tickets in other teams' projects that consume or feed this work>

**Design:** <the PRD and decision records, linked>

**GitHub (<repo>):** milestone [<title>](<url>), issues [#<n>](<url>), …
```
