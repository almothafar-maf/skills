# Contributing

## Adding a skill

1. Put it in `skills/<name>/SKILL.md`, with a frontmatter `name` that matches the folder. Everything in that folder is installed with the skill, so it holds only what the agent reads: `SKILL.md`, its reference files and its scripts.
2. Write its page for people in `docs/<name>.md`: how to run it, what it needs, what it changes, and what a run costs.
3. Add a row for it to the skills table in the [README](README.md), linking that page.

Plugin installs pick it up with their next update: the plugin carries no `version`, so each commit counts as a new one.

## Checks

`claude plugin validate .` and `claude plugin validate .claude-plugin/plugin.json` check the manifests, and their warning about the missing version is expected.

The skills set `argument-hint` and `disable-model-invocation` in their frontmatter. The [Agent Skills specification](https://agentskills.io/specification) does not define them, so a strict validator flags them, but agents such as Claude Code read them: keep them.

## Writing

- The repository is public: skills, docs and commit messages stay generic, and name no private repository, person or internal system. Examples use placeholders such as `<owner>/<repo>`.
- Commit messages follow Conventional Commits, such as `fix: …` or `feat: add the <name> skill`, and the body says why.
