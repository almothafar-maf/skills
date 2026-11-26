# Contributing

## Adding a skill

1. Put it in `skills/<name>/SKILL.md`, with a frontmatter `name` that matches the folder. Everything in that folder is installed with the skill, so it holds only what the agent reads: `SKILL.md`, its reference files and its scripts.
2. Write its page for people in `docs/<name>.md`: how to run it, what it needs, what it changes, and what a run costs.
3. Add a row for it to the skills table in the [README](README.md), linking that page.

Users get it with the next [release](#releases).

## Releases

Each push to `main` runs [release-please](https://github.com/googleapis/release-please), which keeps a release PR open with the next version and its `CHANGELOG.md` entries. Merge that PR to ship: it sets `version` in `.claude-plugin/plugin.json`, then tags `v<version>` and publishes a GitHub release. Plugin installs update only when `version` changes, and `gh skill` installs take the latest release, so a commit reaches users with the release that holds it.

The commit type picks the next version:

- `feat:` raises the minor version and `fix:` the patch. `feat!:`, or a `BREAKING CHANGE:` footer, raises the major, for a change that breaks how people run a skill, such as a renamed skill or a dropped argument.
- Other types, such as `docs:`, `ci:` and `chore:`, release nothing and stay out of the changelog. A change under `skills/` that users should get is a `feat` or a `fix`.

Leave `version`, `CHANGELOG.md` and `.release-please-manifest.json` to the release PR.

## Checks

`claude plugin validate .` and `claude plugin validate .claude-plugin/plugin.json` check the manifests.

The skills set `argument-hint` and `disable-model-invocation` in their frontmatter. The [Agent Skills specification](https://agentskills.io/specification) does not define them, so a strict validator flags them, but agents such as Claude Code read them: keep them.

## Writing

- The repository is public: skills, docs and commit messages stay generic, and name no private repository, person or internal system. Examples use placeholders such as `<owner>/<repo>`.
- Commit messages follow Conventional Commits, such as `fix: …` or `feat: add the <name> skill`, and the body says why.
