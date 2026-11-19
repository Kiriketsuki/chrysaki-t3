# chrysaki-t3-stats

T3 Code loads Claude Code mods and runs their hooks. It draws nothing from them. This mod works around that. Each session writes its stats to a JSON file. A small local server shows all sessions on one web page.

Open `http://127.0.0.1:4517/` in the T3 Code browser panel.

## What it does

The mod writes one file for each session: `<data>/sessions/<sessionId>.json`. It writes at session start, at prompt submit, at turn end, after a tool call, and every 30 seconds. A tool call writes at most once in 5 seconds.

The file holds the folder, the model, the context fill, the rate-limit windows, the cost, and the counters for turns and tool calls. The mod leaves out any value that the engine does not give.

The mod starts `server/serve.py` at session start. The script detaches itself and exits the starter at once. A second start finds the port in use and exits quietly. The server binds `127.0.0.1` only.

## Hub sessions

The usage card of T3 Code is wrong on a machine that uses a hub. A hub session has `CLAUDE_HUB_POOL` set. The mod then reads the hub cache file `<cache>/cliproxy/<pool>.status.json`. It names the serving seat from the reset times of the session. The page shows the pool, the seat, and the limits of that seat.

When the cache is missing, stale, or does not name one seat, the file holds `hub: { pool, seat: null, limits: [] }`. The page then says `hub seat unknown`.

## Options

| Option | Default | Meaning |
|---|---|---|
| `dataDir` | empty | The data folder. Empty means `.cache/chrysaki-t3-stats` in the home folder. |
| `port` | `4517` | The port of the page. |
| `serve` | `on` | Set `off` to skip the server start. |

## Requirements

Python 3.10 or newer on the path. The mod runs `python` on Windows and `python3` elsewhere.

## Server routes

| Route | Answer |
|---|---|
| `/` | The page. |
| `/api/sessions` | `{ now, sessions }`, newest update first. |
| `/health` | `ok`. |

Any other path gives 404. The server deletes session files older than 7 days.

## Test

Run `claude plugin test chrysaki-t3-stats` from the `mods` folder.
