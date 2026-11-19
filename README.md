# chrysaki-t3

Chrysaki for [T3 Code](https://t3.codes). This repo is the alternative to [chrysaki-claude](https://github.com/Kiriketsuki/chrysaki-claude) for sessions that run in T3 Code. Use chrysaki-claude for the Claude Code terminal and the Claude desktop app.

T3 Code draws nothing that a Claude Code mod sends: no pane, no band, no toast and no status text. So the statusline and the panes of chrysaki-claude do not show there. This repo gives the same things by the two routes that T3 Code does have: a theme file and a page in the browser panel.

| Part | What it does |
|:---|:---|
| [`themes/chrysaki.json`](themes/chrysaki.json) | The Chrysaki look for the T3 Code app: colours for each role, plus CSS for the header, the composer and the usage card |
| [`mods/chrysaki-t3-stats`](mods/chrysaki-t3-stats/) | Writes the stats of each session to a file and serves one page with all sessions. The page replaces the statusline |

## What a mod can do in T3 Code

Tested on T3 Code 0.1.10 with Claude Code 2.1.327, on Windows.

| Feature | Result |
|:---|:---|
| Load from `CLAUDE_CODE_PLUGIN_DIRS` | Works |
| `tool.call` hook: deny or rewrite a tool call | Works |
| `prompt.submit` and `turn.complete` hooks | Work |
| A model tool from `$.tool.register` | Works |
| File, clock, process and environment calls | Work |
| Slash command from `$.command.register` | Does not show in the command menu |
| System prompt section from `prompt.compose` | The engine skips the hook |
| Pane, band, toast, status text, look | Not drawn. No surface attaches |

A mod in T3 Code can guard, rewrite and add tools. It cannot show anything.

## Install

### Theme

Ask the agent in a T3 Code thread to set the theme from `themes/chrysaki.json`. The agent publishes it with the `t3_theme_set` tool and the app changes at once.

The app keeps published themes in `~/.t3/userdata/themes/`. A copy of the file into that folder is not tested as an install route.

The theme is dark only. Chrysaki has no light palette.

### Stats page

1. Copy `mods/chrysaki-t3-stats` to a folder outside this checkout, such as `~/.local/share/claude-code-mods/chrysaki-t3-stats`. A branch switch in the checkout must not change what each session loads.
2. Add that folder to `CLAUDE_CODE_PLUGIN_DIRS`. Separate folders with `:` on Linux and `;` on Windows. Set it in the `env` block of `~/.claude/settings.json`, or in the managed settings file of the machine.
3. Start a new thread. The mod starts the page server on the first session.
4. Open `http://127.0.0.1:4517` in the T3 Code browser panel.

See the [mod README](mods/chrysaki-t3-stats/README.md) for the options and the file format.

## The usage card in T3 Code

Two facts about the card in the thread details:

- It shows the percent that remains, not the percent used. The theme adds the word `left` to each value.
- It reads the Claude login of the machine and asks Anthropic for the limits of that account. On a machine that sends model requests through a hub, the card shows the login account and not the seat that serves the session. The stats page reads the hub cache and shows the seat.

## Develop

```bash
claude plugin validate mods/chrysaki-t3-stats
claude plugin test mods/chrysaki-t3-stats
```

Colours come from [chrysaki-core](https://github.com/Kiriketsuki/chrysaki-core). The theme file holds copies of the token values.
