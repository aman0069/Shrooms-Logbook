import assert from 'node:assert/strict'
import { existsSync, rmSync } from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'

const databasePath = path.resolve('.tmp-api-smoke.db')
const port = '3123'
const prismaCli = path.resolve('node_modules/prisma/build/index.js')
const tsxCli = path.resolve('node_modules/tsx/dist/cli.mjs')

function run(commandName: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(commandName, args, { env: { ...process.env, ...env }, stdio: 'ignore' })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${commandName} exited with ${code}`)))
  })
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (response.ok) return
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('API did not become healthy')
}

async function main() {
  if (existsSync(databasePath)) rmSync(databasePath)
  await run(process.execPath, [prismaCli, 'db', 'push', '--skip-generate', '--accept-data-loss'], { DATABASE_URL: `file:${databasePath}` })
  const server: ChildProcess = spawn(process.execPath, [tsxCli, 'server/index.ts'], { env: { ...process.env, DATABASE_URL: `file:${databasePath}`, PORT: port }, stdio: 'ignore' })
  try {
    await waitForHealth()
    const missingRequestId = await fetch(`http://127.0.0.1:${port}/api/activities`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ processType: 'Cleaning / sanitation' }) })
    assert.equal(missingRequestId.status, 400)

    const body = { processType: 'Cleaning / sanitation', activityDateTime: new Date().toISOString(), notes: 'API smoke test', clientRequestId: 'smoke-request-001' }
    const first = await fetch(`http://127.0.0.1:${port}/api/activities`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal(first.status, 201)
    const second = await fetch(`http://127.0.0.1:${port}/api/activities`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal(second.status, 200)
    const activities = await fetch(`http://127.0.0.1:${port}/api/activities`).then((response) => response.json()) as Array<{ clientRequestId: string }>
    assert.equal(activities.filter((activity) => activity.clientRequestId === body.clientRequestId).length, 1)
    console.log('API smoke test passed: validation and idempotency')
  } finally {
    await new Promise<void>((resolve) => {
      if (server.exitCode !== null) return resolve()
      server.once('exit', () => resolve())
      server.kill()
    })
    if (existsSync(databasePath)) rmSync(databasePath)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})