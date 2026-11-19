#!/bin/sh
# Runs one command in a Boat sandbox and prints its stdout, stderr and exit code.
# Usage: sh boat/bx.sh <sandbox-id> "<command>"
if [ "$#" -ne 2 ]; then
  echo "Usage: sh boat/bx.sh <sandbox-id> \"<command>\"" >&2
  exit 2
fi
"$HOME/.ascii/bin/boat.exe" exec "$1" "$2" 2>&1 | python -c "
import json, sys
lines = sys.stdin.read().strip().splitlines()
try:
    result = json.loads(lines[-1])
except (ValueError, IndexError):
    print('\n'.join(lines))
    sys.exit(1)
if result.get('event') == 'error':
    print('Boat error:', result.get('code'), '-', result.get('error'), file=sys.stderr)
    sys.exit(1)
print(result.get('stdout', ''))
if result.get('stderr'):
    print('STDERR:', result['stderr'])
sys.exit(result.get('exitCode') or 0)
"
