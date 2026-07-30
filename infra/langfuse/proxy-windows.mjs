/**
 * Always listen on Windows 127.0.0.1:3100 and forward to WSL Langfuse.
 * This is the stable path when Docker runs inside WSL (NAT networking).
 */
import http from 'node:http'
import net from 'node:net'
import { spawnSync } from 'node:child_process'

const LISTEN = Number(process.env.LANGFUSE_PROXY_PORT || 3100)
const DISTRO = process.env.WSL_DISTRO || 'Ubuntu-24.04'

function wslIp() {
  const r = spawnSync('wsl.exe', ['-d', DISTRO, '-u', 'root', '--', 'hostname', '-I'], {
    encoding: 'utf8',
  })
  return (r.stdout || '').trim().split(/\s+/).find((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x))
}

function ensureWsl() {
  spawnSync(
    'wsl.exe',
    ['-d', DISTRO, '-u', 'root', '--', 'bash', '/mnt/e/Tianmeng/resume-creation-web/infra/langfuse/ensure-up-wsl.sh'],
    { stdio: 'inherit' },
  )
}

function canConnect(host, port, ms = 3000) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port }, () => {
      s.end()
      resolve(true)
    })
    s.setTimeout(ms, () => {
      s.destroy()
      resolve(false)
    })
    s.on('error', () => resolve(false))
  })
}

async function resolveTarget() {
  let ip = wslIp()
  if (!ip) throw new Error('no WSL IP')
  if (!(await canConnect(ip, 3100, 4000))) {
    console.log(`cannot reach ${ip}:3100 — running ensure-up…`)
    ensureWsl()
    ip = wslIp()
    if (!ip) throw new Error('no WSL IP after ensure')
  }
  if (!(await canConnect(ip, 3100, 8000))) {
    throw new Error(`still cannot reach ${ip}:3100`)
  }
  return { host: ip, port: 3100 }
}

async function main() {
  console.log('ensuring WSL Langfuse…')
  ensureWsl()
  let target = await resolveTarget()
  console.log(`forward → ${target.host}:${target.port}`)

  // Refresh WSL IP periodically (NAT IP can change after wsl --shutdown).
  setInterval(async () => {
    try {
      const next = await resolveTarget()
      if (next.host !== target.host) {
        console.log(`WSL IP changed ${target.host} → ${next.host}`)
      }
      target = next
    } catch (e) {
      console.error('refresh failed', e.message || e)
    }
  }, 30_000)

  const server = http.createServer((req, res) => {
    const p = http.request(
      {
        hostname: target.host,
        port: target.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `${target.host}:${target.port}` },
      },
      (pr) => {
        res.writeHead(pr.statusCode || 502, pr.headers)
        pr.pipe(res)
      },
    )
    p.on('error', (e) => {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(`proxy error: ${e.message}`)
    })
    req.pipe(p)
  })

  server.on('error', (e) => {
    if (e && e.code === 'EADDRINUSE') {
      console.error(
        `port ${LISTEN} already in use. Stop whatever holds it, or set LANGFUSE_PROXY_PORT=3110`,
      )
    }
    console.error(e)
    process.exit(1)
  })

  server.listen(LISTEN, '127.0.0.1', () => {
    console.log(`proxy up — OPEN http://127.0.0.1:${LISTEN}/`)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
