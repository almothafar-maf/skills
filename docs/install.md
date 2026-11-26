# Install

Every route installs all the skills in this repository, as of its latest [release](https://github.com/almothafar-maf/skills/releases). The plugin routes, for Claude Code, the Copilot CLI and VS Code, also bring in each new release, with any skills it adds; files installed for Cursor or any other agent update by hand. Pick one route per agent: a skill installed twice shows up twice.

## Claude Code

```bash
claude plugin marketplace add almothafar-maf/skills
claude plugin install almothafar@almothafar-maf
```

To have it update itself, run `/plugin`, open **Marketplaces**, select `almothafar-maf` and choose **Enable auto-update**. Otherwise `claude plugin update almothafar@almothafar-maf` updates it. Claude Code puts the plugin's name in front of each skill, so `/sync-jira` runs as `/almothafar:sync-jira`.

## GitHub Copilot CLI

```bash
copilot plugin marketplace add almothafar-maf/skills
copilot plugin install almothafar@almothafar-maf
```

To have it update itself, add `"autoUpdate": true` to the `almothafar-maf` entry that the first command wrote to `~/.copilot/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "almothafar-maf": { "source": { "source": "github", "repo": "almothafar-maf/skills" }, "autoUpdate": true }
  }
}
```

Otherwise `copilot plugin update almothafar@almothafar-maf` updates it. Each skill runs under its own name, such as `/sync-jira`.

## VS Code with GitHub Copilot

Run **Chat: Install Plugin from Source** and enter `https://github.com/almothafar-maf/skills`. VS Code checks for updates daily while `extensions.autoUpdate` is on, as it is by default, and **Chat: Update Plugins** updates it at once. VS Code also loads plugins the Copilot CLI installed, so one of the two installs is enough. Like Claude Code, it puts the plugin's name in front of each skill, as in `/almothafar:sync-jira`.

## Cursor and any other agent

```bash
gh skill install almothafar-maf/skills --all --agent cursor --scope user     # Cursor: ~/.cursor/skills
gh skill install almothafar-maf/skills --all --agent universal --scope user  # any other agent: ~/.agents/skills
```

`~/.agents/skills` is the shared folder that Codex and other Agent Skills agents read. Cursor and the Copilot CLI read it too, so use it for them only in place of their own route. For another agent's own folder, swap `--agent` for one that `gh skill install --help` lists, or run `gh skill install almothafar-maf/skills` alone to pick the skills, the agent and the scope from prompts.

Files installed with `gh skill` come from the latest release and do not update themselves: `gh skill update --all` refreshes them, and running the install again with `--force` adds skills published since. To stay on one release, add `--pin` with its tag, such as `--pin v1.0.0`. Keep `--scope user`, since a project install writes into the repository you run it in.
