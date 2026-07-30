#!/usr/bin/env bash
set -euo pipefail
cd /mnt/e/Tianmeng/resume-creation-web/infra/langfuse
CIP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' langfuse-langfuse-web-1)
echo "CIP=$CIP"
curl -sS -m 3 -w "direct=%{http_code}\n" "http://${CIP}:3000/api/public/health" || echo direct_fail
curl -sS -m 3 -w "proxy3100=%{http_code}\n" "http://127.0.0.1:3100/api/public/health" || echo proxy_fail
# if direct works but proxy fails, recreate proxies
if curl -fsS -m 2 "http://${CIP}:3000/api/public/health" >/dev/null; then
  echo "container_ok"
else
  echo "container_bad — recreate web"
  docker compose up -d --force-recreate langfuse-web
  sleep 8
  CIP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' langfuse-langfuse-web-1)
  curl -sS -m 5 -w "after=%{http_code}\n" "http://${CIP}:3000/api/public/health" || true
fi
