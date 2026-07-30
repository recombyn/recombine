#!/usr/bin/env bash
set -euo pipefail
cd /mnt/e/Tianmeng/resume-creation-web/infra/langfuse

if ! docker info >/dev/null 2>&1; then
  dockerd >/var/log/dockerd.log 2>&1 &
  for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi

docker compose up -d --force-recreate langfuse-web
sleep 10

echo "=== compose ps ==="
docker compose ps
CIP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' langfuse-langfuse-web-1)
echo "CIP=$CIP"
echo "=== bind ==="
docker compose exec -T langfuse-web sh -c 'netstat -lntp 2>/dev/null | grep 3000 || true'
echo "=== direct ==="
curl -sS -m 5 -w "\ncode=%{http_code}\n" "http://${CIP}:3000/api/public/health" || echo fail_direct
echo "=== host 3100 ==="
curl -sS -m 5 -w "\ncode=%{http_code}\n" "http://127.0.0.1:3100/api/public/health" || echo fail_host
echo "=== ss 3100 ==="
ss -lntp | grep 3100 || true
echo "=== hostname -I ==="
hostname -I
echo "=== logs ==="
docker compose logs --tail=30 langfuse-web
