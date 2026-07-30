#!/usr/bin/env bash
set -euo pipefail

mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.1ms.run"
  ]
}
EOF

pkill dockerd 2>/dev/null || true
sleep 2
dockerd >/var/log/dockerd.log 2>&1 &
for i in $(seq 1 60); do
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker info >/dev/null

cd /mnt/e/Tianmeng/resume-creation-web/infra/langfuse
sed -i 's/\r$//' .env || true

echo "=== pull ==="
docker compose pull
echo "=== up ==="
docker compose up -d
echo "=== ps ==="
docker compose ps

echo "=== wait web ==="
for i in $(seq 1 120); do
  if curl -fsS "http://127.0.0.1:3100/api/public/health" >/dev/null 2>&1; then
    echo "LANGFUSE_UP"
    curl -fsS "http://127.0.0.1:3100/api/public/health" || true
    exit 0
  fi
  if curl -fsS "http://127.0.0.1:3100" >/dev/null 2>&1; then
    echo "LANGFUSE_UP_HTML"
    exit 0
  fi
  sleep 2
done

echo "LANGFUSE_NOT_READY"
docker compose ps
docker compose logs --tail=60 langfuse-web || true
exit 1
