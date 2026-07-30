#!/usr/bin/env bash
set -euo pipefail

if ! docker info >/dev/null 2>&1; then
  dockerd >/var/log/dockerd.log 2>&1 &
  for i in $(seq 1 40); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi
docker info >/dev/null

cd /mnt/e/Tianmeng/resume-creation-web/infra/langfuse
sed -i 's/\r$//' .env docker-compose.yml || true

# Prefer localhost for NEXTAUTH when Windows can reach it; keep WSL IP as fallback note.
WSL_IP=$(hostname -I | awk '{print $1}')
# Browser on Windows should use localhost after HOSTNAME=0.0.0.0 fix + working relay;
# mirrored/broken NAT: still print WSL IP.
sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=http://localhost:3100|" .env || true
printf 'http://localhost:3100\nhttp://%s:3100\n' "$WSL_IP" > WINDOWS_URL.txt

docker compose up -d --force-recreate langfuse-web
sleep 3

for i in $(seq 1 90); do
  # Hit via published port on WSL host
  code=$(curl -s -o /tmp/lf.out -w '%{http_code}' http://127.0.0.1:3100/api/public/health || echo 000)
  echo "try=$i code=$code"
  if [ "$code" = "200" ]; then
    cat /tmp/lf.out; echo
    # Confirm listening on 0.0.0.0 inside container
    docker compose exec -T langfuse-web sh -c 'netstat -lntp 2>/dev/null | grep 3000 || true'
    echo "LANGFUSE_UP"
    echo "TRY_WINDOWS=http://127.0.0.1:3100"
    echo "OR_WSL_IP=http://${WSL_IP}:3100"
    exit 0
  fi
  sleep 2
done
docker compose logs --tail=50 langfuse-web
exit 1
