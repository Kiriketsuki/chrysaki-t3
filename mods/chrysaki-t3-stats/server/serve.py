#!/usr/bin/env python3
"""Local stats server of the chrysaki-t3-stats mod.

Serves server/index.html and the session files as JSON. It binds 127.0.0.1
only and uses the Python standard library alone (Python 3.10 or newer).
"""

import argparse
import json
import os
import re
import socket
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

HOST = "127.0.0.1"
DEFAULT_PORT = 4517
SESSION_FILE_RE = re.compile(r"^[A-Za-z0-9_-]+\.json$")
MAX_FILE_BYTES = 262144
MAX_AGE_SECONDS = 7 * 24 * 3600
MAX_LOG_BYTES = 102400
HERE = Path(__file__).resolve().parent
CSP = (
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; "
    "connect-src 'self'; base-uri 'none'; form-action 'none'"
)


def log(message: str) -> None:
    """Writes one line to stderr."""
    print(f"chrysaki-t3-stats: {message}", file=sys.stderr, flush=True)


def read_session(path: Path) -> dict | None:
    """Returns the parsed session, or None when the file is not valid."""
    try:
        if path.stat().st_size > MAX_FILE_BYTES:
            log(f"skip {path.name}: file too large")
            return None
        body = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        log(f"skip {path.name}: {error}")
        return None
    valid = (
        isinstance(body, dict)
        and isinstance(body.get("sessionId"), str)
        and isinstance(body.get("updatedAt"), (int, float))
        and not isinstance(body.get("updatedAt"), bool)
    )
    if not valid:
        log(f"skip {path.name}: missing sessionId or updatedAt")
        return None
    return body


def delete_old(path: Path, now: float) -> bool:
    """Deletes a file older than the maximum age. Returns True when deleted."""
    try:
        if now - path.stat().st_mtime <= MAX_AGE_SECONDS:
            return False
        path.unlink()
        return True
    except OSError as error:
        log(f"cannot delete {path.name}: {error}")
        return False


def list_sessions(data_dir: Path) -> list[dict]:
    """Every valid session file, newest update first."""
    folder = data_dir / "sessions"
    sessions: list[dict] = []
    try:
        entries = list(os.scandir(folder))
    except FileNotFoundError:
        return sessions
    except OSError as error:
        log(f"cannot list {folder}: {error}")
        return sessions
    now = time.time()
    for entry in entries:
        if not SESSION_FILE_RE.match(entry.name):
            continue
        if not entry.is_file(follow_symlinks=False):
            continue
        path = Path(entry.path)
        if delete_old(path, now):
            continue
        body = read_session(path)
        if body is not None:
            sessions.append(body)
    return sorted(sessions, key=lambda s: s["updatedAt"], reverse=True)


def make_handler(data_dir: Path, port: int):
    allowed_hosts = {f"{HOST}:{port}", f"localhost:{port}"}

    class Handler(BaseHTTPRequestHandler):
        server_version = "chrysaki-t3-stats"

        def log_message(self, format: str, *args) -> None:  # noqa: A002
            return

        def send_body(self, status: int, content_type: str, body: bytes) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", CSP)
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            # A fixed host check blocks DNS rebinding from a web page.
            if self.headers.get("Host", "") not in allowed_hosts:
                log(f"403 bad host {self.headers.get('Host', '')!r}")
                self.send_body(403, "text/plain; charset=utf-8", b"forbidden\n")
                return
            path = urlsplit(self.path).path
            try:
                if path == "/":
                    page = (HERE / "index.html").read_bytes()
                    self.send_body(200, "text/html; charset=utf-8", page)
                elif path == "/api/sessions":
                    payload = {"now": int(time.time() * 1000), "sessions": list_sessions(data_dir)}
                    self.send_body(200, "application/json", json.dumps(payload).encode("utf-8"))
                elif path == "/health":
                    self.send_body(200, "text/plain; charset=utf-8", b"ok\n")
                else:
                    log(f"404 {path}")
                    self.send_body(404, "text/plain; charset=utf-8", b"not found\n")
            except (OSError, ValueError) as error:
                log(f"500 {path}: {error}")
                self.send_body(500, "text/plain; charset=utf-8", b"server error\n")

    return Handler


def spawn_detached(argv: list[str], data_dir: Path) -> int:
    """Starts a copy of this script with no pipes, then returns at once."""
    data_dir.mkdir(parents=True, exist_ok=True)
    log_path = data_dir / "server.log"
    # A log past the size cap restarts, so repeated port-in-use lines stay small.
    mode = "w" if log_path.exists() and log_path.stat().st_size > MAX_LOG_BYTES else "a"
    with open(log_path, mode, encoding="utf-8") as errors:
        options: dict = {"stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL, "stderr": errors}
        if os.name == "nt":
            base = 0x00000008 | 0x00000200 | 0x08000000  # DETACHED_PROCESS, NEW_PROCESS_GROUP, NO_WINDOW
            breakaway = 0x01000000  # CREATE_BREAKAWAY_FROM_JOB
            try:
                subprocess.Popen(argv, creationflags=base | breakaway, **options)
            except OSError:
                # A job that forbids breakaway refuses the flag. Start without it.
                subprocess.Popen(argv, creationflags=base, **options)
        else:
            subprocess.Popen(argv, start_new_session=True, **options)
    return 0


class ExclusiveServer(ThreadingHTTPServer):
    """A server that refuses a port another process already holds.

    On Windows, SO_REUSEADDR lets two sockets bind the same port, so the
    second start would not fail. SO_EXCLUSIVEADDRUSE restores the failure.
    """

    allow_reuse_address = False

    def server_bind(self) -> None:
        if os.name == "nt":
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def serve(data_dir: Path, port: int) -> int:
    try:
        server = ExclusiveServer((HOST, port), make_handler(data_dir, port))
    except OSError as error:
        # A second start finds the port in use. This is normal, so exit quietly.
        log(f"not started on {HOST}:{port}: {error}")
        return 0
    log(f"serving {data_dir} on http://{HOST}:{port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="chrysaki-t3-stats page server")
    parser.add_argument("--data", required=True, help="the data folder")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--detach", action="store_true", help="start a detached copy and exit")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        log(f"bad port {args.port}")
        return 2
    data_dir = Path(args.data)
    if args.detach:
        child = [sys.executable, str(Path(__file__).resolve()), "--data", str(data_dir), "--port", str(args.port)]
        try:
            return spawn_detached(child, data_dir)
        except OSError as error:
            log(f"cannot detach: {error}")
            return 1
    return serve(data_dir, args.port)


if __name__ == "__main__":
    sys.exit(main())
