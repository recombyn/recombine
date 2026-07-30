#!/usr/bin/env bash
set -euo pipefail
# Dump recent docker stop/start with invocation context
journalctl -u docker --since '20 min ago' --no-pager -o short-precise | grep -E 'Stopping|Stopped|Starting|Started|Main process'
echo '==== INVOCATION ===='
# _CMDLINE of the process that asked systemd (best-effort via coredump/audit absent)
journalctl --since '20 min ago' --no-pager | grep -E 'systemd\[[0-9]+\]: (Stopping|Starting) docker' | tail -40
echo '==== CALLERS ===='
# processes that might be restarting docker
ps aux | grep -E 'systemctl|service docker|dockerd|ensure-up|hard-reset|fix-web' | grep -v grep || true
echo '==== UPTIME ===='
uptime
systemctl show docker -p ActiveEnterTimestamp -p ActiveState -p SubState -p NRestarts
