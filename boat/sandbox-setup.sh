#!/usr/bin/env bash
# Prepares a Boat sandbox as a T3 Code environment.
# Run it inside the sandbox: boat exec <id> "bash -s" < boat/sandbox-setup.sh
# After it ends, run `t3 up --connect --headless` once and approve the code.
set -euo pipefail

T3_VERSION="${T3_VERSION:-0.1.10}"
SECRETS_FILE="/run/ascii-secrets/env.sh"
UNIT_DIR="$HOME/.config/systemd/user/t3code.service.d"

npm install -g "t3@${T3_VERSION}"

# Boat puts the agent credentials in a shell file. A systemd service does not
# read that file, so the T3 server cannot sign in to Claude or Codex without
# this drop-in.
mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/10-boat-secrets.conf" <<EOF
[Service]
ExecStart=
ExecStart=/bin/bash -c ". ${SECRETS_FILE}; exec \$HOME/.t3/runtime/versions/${T3_VERSION}/t3 __service-launcher"
EOF

# The headless browser needs the Chrome sandbox and its libraries.
t3 browser setup

if systemctl --user list-unit-files t3code.service >/dev/null 2>&1; then
  systemctl --user daemon-reload
  systemctl --user restart t3code.service
fi

echo "Sandbox is ready. Next: t3 up --connect --headless"
