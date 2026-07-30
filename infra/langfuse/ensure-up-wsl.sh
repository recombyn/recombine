#!/usr/bin/env bash
set -euo pipefail
cd /mnt/e/Tianmeng/resume-creation-web/infra/langfuse
sed -i 's/\r$//' .env docker-compose.yml wsl-keepalive.service || true

# Install distro keepalive so WSL does not tear down systemd (and Postgres).
cp -f wsl-keepalive.service /etc/systemd/system/wsl-keepalive.service
systemctl daemon-reload
systemctl enable --now wsl-keepalive.service || true

if ! docker info >/dev/null 2>&1; then
  systemctl start docker || service docker start || true
  for i in $(seq 1 60); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi
if ! docker info >/dev/null 2>&1; then
  echo "docker not ready" >&2
  exit 1
fi

docker compose up -d

# Wait until web can resolve postgres AND health is OK (login needs DB).
for i in $(seq 1 90); do
  if docker compose exec -T langfuse-web sh -c 'getent hosts postgres >/dev/null && wget -qO- http://127.0.0.1:3000/api/public/health 2>/dev/null | grep -q OK'; then
    # Extra settle — Prisma pool after DNS is up
    sleep 3
    if curl -fsS -m 3 http://127.0.0.1:3100/api/public/health >/tmp/lf.out 2>/dev/null; then
      cat /tmp/lf.out; echo
      echo LANGFUSE_READY
      echo OPEN=http://127.0.0.1:3100/
      hostname -I | awk '{print "WSL_IP="$1}'
      exit 0
    fi
  fi
  echo "wait $i"
  sleep 2
done
docker compose ps
docker compose logs --tail=40 langfuse-web
exit 1
