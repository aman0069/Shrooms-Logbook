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
  const server: ChildProcess = spawn(process.execPath, [tsxCli, 'server/index.ts'], { env: { ...process.env, DATABASE_URL: `file:${databasePath}`, PORT: port }, stdio: 'inherit' })
  try {
    await waitForHealth()
    const missingRequestId = await fetch(`http://127.0.0.1:${port}/api/activities`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ processType: 'Cleaning / sanitation' }) })
    assert.equal(missingRequestId.status, 400)

    const oversizedAutoclave = await fetch(`http://127.0.0.1:${port}/api/activities`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ processType: 'Autoclave run', jarCount: 76, clientRequestId: 'smoke-autoclave-076' }) })
    assert.equal(oversizedAutoclave.status, 400)

    const ricePreparation = await fetch(`http://127.0.0.1:${port}/api/activities`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ processType: 'Fill jars with rice', clientRequestId: 'smoke-rice-prep-001' }) })
    assert.equal(ricePreparation.status, 201)
    const prepBatchId = (await ricePreparation.json() as { batchId: string }).batchId
    const nutritionPreparation = await fetch(`http://127.0.0.1:${port}/api/activities`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ processType: 'Fill jars with nutritional broth', clientRequestId: 'smoke-nutrition-prep-001' }) })
    assert.equal(nutritionPreparation.status, 201)
    assert.equal((await nutritionPreparation.json() as { batchId: string }).batchId, prepBatchId)

    const fullAutoclave = await fetch(`http://127.0.0.1:${port}/api/activities`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ processType: 'Autoclave run', jarCount: 75, clientRequestId: 'smoke-autoclave-075' }) })
    assert.equal(fullAutoclave.status, 201)
    assert.equal((await fullAutoclave.json() as { autoclaveCycleNumber: number }).autoclaveCycleNumber, 1)
    for (const cycle of [2, 3]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/activities`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ processType: 'Autoclave run', jarCount: 75, clientRequestId: `smoke-autoclave-cycle-${cycle}` }) })
      assert.equal(response.status, 201)
      assert.equal((await response.json() as { autoclaveCycleNumber: number }).autoclaveCycleNumber, cycle)
    }
    const fourthCycle = await fetch(`http://127.0.0.1:${port}/api/activities`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ processType: 'Autoclave run', jarCount: 75, clientRequestId: 'smoke-autoclave-cycle-4' }) })
    assert.equal(fourthCycle.status, 400)
    const dailyBatches = await fetch(`http://127.0.0.1:${port}/api/batches`).then((response) => response.json()) as Array<{ jarCount: number; activityLogs: Array<{ processType: string }> }>
    assert.equal(dailyBatches.length, 1)
    assert.equal(dailyBatches[0].jarCount, 225)
    assert.equal(dailyBatches[0].activityLogs.filter((activity) => activity.processType === 'Autoclave run').length, 3)

    const flasks = await fetch(`http://127.0.0.1:${port}/api/culture-flasks`).then((response) => response.json()) as Array<{ id: string; capacityMl: number }>
    assert.equal(flasks.length, 46)
    assert.equal(flasks[0].capacityMl, 500)
    const culturePreparation = await fetch(`http://127.0.0.1:${port}/api/activities`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ processType: 'Liquid culture preparation', cultureFlaskId: flasks[0].id, operator: 'Smoke test', detailsJson: { strain: 'Cordyceps militaris', sourceCulture: 'LC starter' }, sensorInputs: [{ roomLocation: 'Culture bench', metric: 'temperature', entityId: 'sensor.test_temperature' }], clientRequestId: 'smoke-culture-preparation' }) })
    assert.equal(culturePreparation.status, 201)
    const updatedFlasks = await fetch(`http://127.0.0.1:${port}/api/culture-flasks`).then((response) => response.json()) as Array<{ id: string; status: string; logs: Array<{ activity: { sensorSnapshots: Array<{ roomLocation: string; temperatureStatus: string }> } }> }>
    const preparedFlask = updatedFlasks.find((flask) => flask.id === flasks[0].id)!
    assert.equal(preparedFlask.status, 'Prepared')
    assert.equal(preparedFlask.logs.length, 1)
    assert.equal(preparedFlask.logs[0].activity.sensorSnapshots.find((snapshot) => snapshot.roomLocation === 'Culture bench')?.temperatureStatus, 'unavailable')

    const invalidBatch = await fetch(`http://127.0.0.1:${port}/api/activities`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ processType: 'Cleaning / sanitation', batchId: 'missing-batch', clientRequestId: 'smoke-invalid-batch' }) })
    assert.equal(invalidBatch.status, 400)
    assert.deepEqual(await invalidBatch.json(), { error: 'The selected batch was not found.' })

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