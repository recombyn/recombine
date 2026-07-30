#!/usr/bin/env bash
set -euo pipefail
cd /mnt/e/Tianmeng/resume-creation-web/infra/langfuse
sed -i 's/\r$//' .env
docker compose up -d --force-recreate langfuse-web langfuse-worker
for i in $(seq 1 90); do
  code=$(curl -s -o /tmp/lf.out -w '%{http_code}' http://127.0.0.1:3100/api/public/health || echo 000)
  echo "try=$i code=$code"
  if [ "$code" = "200" ]; then
    cat /tmp/lf.out
    echo
    echo LANGFUSE_UP
    exit 0
  fi
  sleep 2
done
docker compose logs --tail=40 langfuse-web
exit 1
