import cors from 'cors'
import express from 'express'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from './db'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const staticDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

const processTypes = new Set([
  'Autoclave run',
  'Fill jars with rice',
  'Fill jars with nutritional broth',
  'Inoculation',
  'Incubation observation',
  'Dark-room to light-room transfer',
  'Harvest',
  'Contamination observation',
  'Cleaning / sanitation',
  'Equipment maintenance',
  'Other / custom activity',
])
app.use(cors())
app.use(express.json({ limit: '2mb' }))

function scanToken() {
  return randomBytes(16).toString('base64url').slice(0, 22)
}

function localDateCode(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function parseActivityDateTime(value: unknown) {
  const parsed = value ? new Date(String(value)) : new Date()
  if (Number.isNaN(parsed.getTime())) throw new Error('Activity date and time must be valid.')
  return parsed
}

function positiveInteger(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return 0
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${field} must be a whole number.`)
  return parsed
}

type SensorSnapshotInput = {
  roomLocation: string
  temperatureC: number | null
  temperatureStatus: string
  humidityRh: number | null
  humidityStatus: string
  co2Ppm: number | null
  co2Status: string
  lux: number | null
  luxStatus: string
  source: string
}

async function captureSensorSnapshots() {
  const baseUrl = process.env.HA_URL?.replace(/\/$/, '')
  const token = process.env.HA_TOKEN
  const rooms = [
    { name: 'dark', label: 'Dark room', temperature: process.env.HA_DARK_ROOM_TEMPERATURE_ENTITY, humidity: process.env.HA_DARK_ROOM_HUMIDITY_ENTITY, co2: process.env.HA_DARK_ROOM_CO2_ENTITY, lux: process.env.HA_DARK_ROOM_LUX_ENTITY },
    { name: 'light', label: 'Light room', temperature: process.env.HA_LIGHT_ROOM_TEMPERATURE_ENTITY, humidity: process.env.HA_LIGHT_ROOM_HUMIDITY_ENTITY, co2: process.env.HA_LIGHT_ROOM_CO2_ENTITY, lux: process.env.HA_LIGHT_ROOM_LUX_ENTITY },
  ]
  if (!baseUrl || !token) return rooms.map((room) => ({ roomLocation: room.label, temperatureC: null, temperatureStatus: 'missing', humidityRh: null, humidityStatus: 'missing', co2Ppm: null, co2Status: 'missing', lux: null, luxStatus: 'missing', source: 'missing' }))

  const read = async (entityId: string | undefined) => {
    if (!entityId) return { value: null, status: 'missing' }
    try {
      const response = await fetch(`${baseUrl}/api/states/${encodeURIComponent(entityId)}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) return { value: null, status: 'unavailable' }
      const state = await response.json() as { state?: string }
      const value = Number(state.state)
      return Number.isFinite(value) ? { value, status: 'home_assistant' } : { value: null, status: 'unavailable' }
    } catch (error) {
      console.warn('[sensor-read] Home Assistant sensor unavailable', error)
      return { value: null, status: 'unavailable' }
    }
  }

  return Promise.all(rooms.map(async (room): Promise<SensorSnapshotInput> => {
    const [temperature, humidity, co2, lux] = await Promise.all([read(room.temperature), read(room.humidity), read(room.co2), read(room.lux)])
    const statuses = [temperature.status, humidity.status, co2.status, lux.status]
    return { roomLocation: room.label, temperatureC: temperature.value, temperatureStatus: temperature.status, humidityRh: humidity.value, humidityStatus: humidity.status, co2Ppm: co2.value, co2Status: co2.status, lux: lux.value, luxStatus: lux.status, source: statuses.some((status) => status === 'home_assistant') ? 'home_assistant' : statuses.some((status) => status === 'unavailable') ? 'unavailable' : 'missing' }
  }))
}

async function nextBatchCode(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], date: Date) {
  const prefix = `AC-${localDateCode(date)}-`
  const existing = await tx.batch.findMany({
    where: { batchCode: { startsWith: prefix } },
    select: { batchCode: true },
  })
  const next = existing.reduce((highest, batch) => {
    const sequence = Number(batch.batchCode.slice(prefix.length))
    return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest
  }, 0) + 1
  return `${prefix}${String(next).padStart(2, '0')}`
}

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ ok: true, status: 'healthy', database: 'connected' })
  } catch (error) {
    console.error('[health] database check failed', error)
    res.status(503).json({ ok: false, status: 'unhealthy', database: 'unavailable' })
  }
})

app.get('/api/batches', async (_req, res, next) => {
  try {
    const batches = await prisma.batch.findMany({
      include: { jars: { orderBy: { sequenceNumber: 'asc' } }, activityLogs: { orderBy: { activityDateTime: 'desc' }, take: 10 } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(batches)
  } catch (error) {
    next(error)
  }
})

app.get('/api/batches/:id', async (req, res, next) => {
  try {
    const batch = await prisma.batch.findUnique({
      where: { id: req.params.id },
      include: {
        jars: { orderBy: { sequenceNumber: 'asc' } },
        activityLogs: { include: { photos: true, sensorSnapshots: true }, orderBy: { activityDateTime: 'desc' } },
      },
    })
    if (!batch) return res.status(404).json({ error: 'Batch not found.' })
    res.json(batch)
  } catch (error) {
    next(error)
  }
})

app.get('/api/activities', async (_req, res, next) => {
  try {
    const activities = await prisma.activityLog.findMany({
      include: { batch: true, jar: true, sensorSnapshots: true },
      orderBy: { activityDateTime: 'desc' },
      take: 100,
    })
    res.json(activities)
  } catch (error) {
    next(error)
  }
})

app.get('/api/lab-scan', async (req, res, next) => {
  try {
    const token = String(req.query.t ?? '')
    if (!token || token.length < 16) return res.status(404).json({ error: 'Label not found.' })
    const batch = await prisma.batch.findUnique({ where: { qrToken: token }, include: { jars: true } })
  if (batch) return res.json({ kind: 'batch', record: batch })
  const jar = await prisma.jar.findUnique({ where: { qrToken: token }, include: { batch: true } })
  if (!jar) return res.status(404).json({ error: 'Label not found.' })
    res.json({ kind: 'jar', record: jar })
  } catch (error) {
    next(error)
  }
})

app.post('/api/activities', async (req, res, next) => {
  try {
    const { processType, operator, notes, detailsJson, batchId, jarIds, createJarLabels, clientRequestId } = req.body as Record<string, unknown>
    if (typeof processType !== 'string' || !processTypes.has(processType)) throw new Error('Choose a valid activity process.')
  const activityDateTime = parseActivityDateTime(req.body.activityDateTime)
  const jarCount = positiveInteger(req.body.jarCount, 'Jar count')
  const selectedJarIds = Array.isArray(jarIds) ? jarIds.filter((id): id is string => typeof id === 'string') : []
  const details = typeof detailsJson === 'string' ? detailsJson : JSON.stringify(detailsJson ?? {})
  const sensorSnapshots = await captureSensorSnapshots()

    const result = await prisma.$transaction(async (tx) => {
      if (typeof clientRequestId === 'string') {
        const existing = await tx.activityLog.findUnique({ where: { clientRequestId }, include: { batch: true } })
        if (existing) return { activityId: existing.id, batchId: existing.batchId, batchCode: existing.batch?.batchCode ?? null }
      }
  let resolvedBatchId = typeof batchId === 'string' ? batchId : undefined
  let createdBatch = null
  const activity = await tx.activityLog.create({
        data: {
          type: processType,
          processType,
          activityDateTime,
          timestamp: activityDateTime,
          description: processType,
          operator: typeof operator === 'string' ? operator.trim() || null : null,
          notes: typeof notes === 'string' ? notes.trim() || null : null,
          detailsJson: details,
          clientRequestId: typeof clientRequestId === 'string' ? clientRequestId : null,
          jarCount: jarCount || null,
          batchId: resolvedBatchId,
        },
  })

  if (processType === 'Autoclave run') {
  if (!jarCount) throw new Error('Autoclave runs require a jar count.')
  const batchCode = await nextBatchCode(tx, activityDateTime)
  createdBatch = await tx.batch.create({
          data: {
            batchCode,
            jarCount,
            qrToken: scanToken(),
            barcodeValue: batchCode,
            currentStage: 'Autoclaved',
            currentLocation: 'Autoclave',
            notes: typeof notes === 'string' ? notes.trim() || null : null,
            autoclaveActivityId: activity.id,
          },
  })
  resolvedBatchId = createdBatch.id
  await tx.activityLog.update({ where: { id: activity.id }, data: { batchId: createdBatch.id } })
        if (createJarLabels) {
          await tx.jar.createMany({
            data: Array.from({ length: jarCount }, (_, index) => {
              const sequence = index + 1
              const jarCode = `${batchCode}-J${String(sequence).padStart(3, '0')}`
              return { batchId: createdBatch!.id, jarCode, sequenceNumber: sequence, qrToken: scanToken() }
            }),
          })
        }
      } else if (resolvedBatchId) {
        const batch = await tx.batch.findUnique({ where: { id: resolvedBatchId } })
        if (!batch) throw new Error('The selected batch was not found.')
        await tx.batch.update({ where: { id: batch.id }, data: { currentStage: processType, updatedAt: new Date() } })
      }

      await tx.sensorSnapshot.createMany({ data: sensorSnapshots.map((snapshot) => ({ ...snapshot, activityId: activity.id, batchId: resolvedBatchId, capturedAt: new Date() })) })

      if (selectedJarIds.length) {
  const jars = await tx.jar.findMany({ where: { id: { in: selectedJarIds } } })
  if (jars.length !== selectedJarIds.length) throw new Error('One or more selected jars were not found.')
  await tx.activityLog.update({ where: { id: activity.id }, data: { jarId: jars[0].id, batchId: resolvedBatchId ?? jars[0].batchId } })
      }

      return { activityId: activity.id, batchId: resolvedBatchId, batchCode: createdBatch?.batchCode ?? null }
    })

    res.status(201).json({ ...result, googleSyncStatus: 'pending' })
  } catch (error) {
    console.error('[activity-save] failed', error)
    next(error)
  }
})

app.use(express.static(staticDirectory))
app.get('*', (_req, res) => res.sendFile(path.join(staticDirectory, 'index.html')))

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  res.status(400).json({ error: message })
})

app.listen(port, () => console.log(`Lab API listening on http://localhost:${port}`))

process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})
