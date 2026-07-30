#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

if ! command -v docker >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# Start dockerd if needed
if ! docker info >/dev/null 2>&1; then
  mkdir -p /var/run
  dockerd >/var/log/dockerd.log 2>&1 &
  for i in $(seq 1 60); do
    if docker info >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

docker --version
docker compose version
docker info >/dev/null

cd /mnt/e/Tianmeng/resume-creation-web/infra/langfuse
# strip CRLF from .env if present
sed -i 's/\r$//' .env || true
docker compose up -d
docker compose ps
echo "WAITING_FOR_WEB"
for i in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:3100" >/dev/null 2>&1 || curl -fsS "http://127.0.0.1:3100/api/public/health" >/dev/null 2>&1; then
    echo "LANGFUSE_UP"
    exit 0
  fi
  sleep 2
done
echo "LANGFUSE_NOT_READY_YET"
docker compose logs --tail=80 langfuse-web || true
exit 1
