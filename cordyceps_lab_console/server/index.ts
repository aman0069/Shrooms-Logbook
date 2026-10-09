import express from 'express'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { prisma } from './db'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const staticDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

const processTypes = new Set([
  'Autoclave run',
  'Fill jars with rice',
  'Fill jars with nutritional broth',
  'Cooling observation',
  'Liquid culture preparation',
  'Liquid culture inoculation',
  'Liquid culture observation',
  'Liquid culture contamination',
  'Liquid culture use',
  'Inoculation',
  'Incubation observation',
  'Dark-room to light-room transfer',
  'Harvest',
  'Contamination observation',
  'Cleaning / sanitation',
  'Equipment maintenance',
  'Other / custom activity',
])

class RequestValidationError extends Error {}

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
  if (Number.isNaN(parsed.getTime())) throw new RequestValidationError('Activity date and time must be valid.')
  return parsed
}

function positiveInteger(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return 0
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) throw new RequestValidationError(`${field} must be a whole number.`)
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
  metadataJson: string
}

const activityInputSchema = z.object({
  processType: z.string().trim().min(1),
  activityDateTime: z.union([z.string().trim().min(1), z.date()]).optional(),
  operator: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(5000).optional(),
  detailsJson: z.union([z.string().max(20000), z.record(z.string(), z.string())]).optional(),
  batchId: z.string().trim().min(1).optional(),
  jarIds: z.array(z.string().trim().min(1)).max(500).optional(),
  createJarLabels: z.boolean().optional(),
  clientRequestId: z.string().trim().min(8).max(120),
  jarCount: z.union([z.number(), z.string()]).optional(),
  cultureFlaskId: z.string().trim().min(1).optional(),
  sensorInputs: z.array(z.object({
    roomLocation: z.string().trim().min(1).max(80),
    metric: z.enum(['temperature', 'humidity', 'co2', 'lux']),
    entityId: z.string().trim().min(1).max(200),
  })).max(24).optional(),
})

type SensorInput = z.infer<typeof activityInputSchema>['sensorInputs'] extends Array<infer T> ? T : never

async function captureSensorSnapshots(sensorInputs: SensorInput[] = []) {
  const baseUrl = (process.env.HA_URL || process.env.SUPERVISOR_URL || 'http://supervisor/core').replace(/\/$/, '')
  const token = process.env.HA_TOKEN || process.env.SUPERVISOR_TOKEN
  const metricFields = {
    temperature: ['temperatureC', 'temperatureStatus'],
    humidity: ['humidityRh', 'humidityStatus'],
    co2: ['co2Ppm', 'co2Status'],
    lux: ['lux', 'luxStatus'],
  } as const
  const sensors: SensorInput[] = sensorInputs.length ? sensorInputs : [
    { roomLocation: 'Dark room', metric: 'temperature', entityId: process.env.HA_DARK_ROOM_TEMPERATURE_ENTITY || '' },
    { roomLocation: 'Dark room', metric: 'humidity', entityId: process.env.HA_DARK_ROOM_HUMIDITY_ENTITY || '' },
    { roomLocation: 'Dark room', metric: 'co2', entityId: process.env.HA_DARK_ROOM_CO2_ENTITY || '' },
    { roomLocation: 'Dark room', metric: 'lux', entityId: process.env.HA_DARK_ROOM_LUX_ENTITY || '' },
    { roomLocation: 'Light room', metric: 'temperature', entityId: process.env.HA_LIGHT_ROOM_TEMPERATURE_ENTITY || '' },
    { roomLocation: 'Light room', metric: 'humidity', entityId: process.env.HA_LIGHT_ROOM_HUMIDITY_ENTITY || '' },
    { roomLocation: 'Light room', metric: 'co2', entityId: process.env.HA_LIGHT_ROOM_CO2_ENTITY || '' },
    { roomLocation: 'Light room', metric: 'lux', entityId: process.env.HA_LIGHT_ROOM_LUX_ENTITY || '' },
  ].filter((sensor) => sensor.entityId)
  const read = async (entityId: string | undefined) => {
    if (!entityId) return { value: null, rawState: null, capturedAt: null, status: 'missing' }
    if (!token) return { value: null, rawState: null, capturedAt: new Date().toISOString(), status: 'unavailable' }
    try {
      const response = await fetch(`${baseUrl}/api/states/${encodeURIComponent(entityId)}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) return { value: null, rawState: null, capturedAt: new Date().toISOString(), status: 'unavailable' }
      const state = await response.json() as { state?: string; last_updated?: string }
      const value = Number(state.state)
      return Number.isFinite(value) ? { value, rawState: state.state ?? null, capturedAt: state.last_updated ?? new Date().toISOString(), status: 'home_assistant' } : { value: null, rawState: state.state ?? null, capturedAt: state.last_updated ?? new Date().toISOString(), status: 'unavailable' }
    } catch (error) {
      console.warn('[sensor-read] Home Assistant sensor unavailable', error)
      return { value: null, rawState: null, capturedAt: new Date().toISOString(), status: 'unavailable' }
    }
  }

  const roomNames = new Set(['Dark room', 'Light room', ...sensors.map((sensor) => sensor.roomLocation)])
  return Promise.all([...roomNames].map(async (roomLocation): Promise<SensorSnapshotInput> => {
    const snapshot: SensorSnapshotInput = { roomLocation, temperatureC: null, temperatureStatus: 'missing', humidityRh: null, humidityStatus: 'missing', co2Ppm: null, co2Status: 'missing', lux: null, luxStatus: 'missing', source: 'missing', metadataJson: '{}' }
    const roomSensors = sensors.filter((sensor) => sensor.roomLocation === roomLocation)
    const readings = await Promise.all(roomSensors.map(async (sensor) => ({ sensor, reading: await read(sensor.entityId) })))
    const metadata: Record<string, unknown> = {}
    for (const { sensor, reading } of readings) {
      const [valueField, statusField] = metricFields[sensor.metric]
      snapshot[valueField] = reading.value
      snapshot[statusField] = reading.status
      metadata[sensor.metric] = { entityId: sensor.entityId, rawState: reading.rawState, capturedAt: reading.capturedAt }
    }
    const statuses = readings.map(({ reading }) => reading.status)
    snapshot.source = statuses.some((status) => status === 'home_assistant') ? 'home_assistant' : statuses.some((status) => status === 'unavailable') ? 'unavailable' : 'missing'
    snapshot.metadataJson = JSON.stringify(metadata)
    return snapshot
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

app.get('/api/culture-flasks', async (_req, res, next) => {
  try {
    if (await prisma.cultureFlask.count() === 0) {
      await prisma.cultureFlask.createMany({
        data: Array.from({ length: 46 }, (_, index) => ({
          id: `culture-flask-${String(index + 1).padStart(3, '0')}`,
          flaskCode: `LC-${String(index + 1).padStart(3, '0')}`,
          capacityMl: 500,
          strain: 'Cordyceps militaris',
          status: 'Not recorded',
          updatedAt: new Date(),
        })),
      })
    }
    const flasks = await prisma.cultureFlask.findMany({
      include: { logs: { orderBy: { createdAt: 'desc' }, include: { activity: { include: { sensorSnapshots: true } } } } },
      orderBy: { flaskCode: 'asc' },
    })
    res.json(flasks)
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
      include: { batch: true, jar: true, sensorSnapshots: true, cultureFlaskLog: { include: { flask: true } } },
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
    const input = activityInputSchema.parse(req.body)
    const { processType, operator, notes, detailsJson, batchId, jarIds, createJarLabels, clientRequestId, cultureFlaskId } = input
    if (typeof processType !== 'string' || !processTypes.has(processType)) throw new RequestValidationError('Choose a valid activity process.')
  const activityDateTime = parseActivityDateTime(input.activityDateTime)
  const jarCount = positiveInteger(input.jarCount, 'Jar count')
  if (processType === 'Autoclave run' && jarCount > 75) throw new RequestValidationError('Autoclave runs are limited to 75 jars.')
  const selectedJarIds = jarIds ?? []
  const details = typeof detailsJson === 'string' ? detailsJson : JSON.stringify(detailsJson ?? {})
  const sensorSnapshots = await captureSensorSnapshots(input.sensorInputs)

    const result = await prisma.$transaction(async (tx) => {
      if (typeof clientRequestId === 'string') {
        const existing = await tx.activityLog.findUnique({ where: { clientRequestId }, include: { batch: true } })
        if (existing) {
          const savedDetails = JSON.parse(existing.detailsJson || '{}') as { autoclaveCycleNumber?: number }
          return { activityId: existing.id, batchId: existing.batchId, batchCode: existing.batch?.batchCode ?? null, autoclaveCycleNumber: savedDetails.autoclaveCycleNumber, idempotent: true }
        }
      }
  let resolvedBatchId = typeof batchId === 'string' ? batchId : undefined
  let createdBatch = null
  let existingAutoclaveBatch = null
  let autoclaveCycleNumber: number | undefined
  let activityDetails = details
  if (processType === 'Autoclave run') {
    if (!jarCount) throw new RequestValidationError('Autoclave runs require a jar count.')
    const prefix = `AC-${localDateCode(activityDateTime)}-`
    existingAutoclaveBatch = await tx.batch.findFirst({ where: { batchCode: { startsWith: prefix }, status: 'active' }, orderBy: { createdAt: 'asc' } })
    const cycleCount = existingAutoclaveBatch
      ? await tx.activityLog.count({ where: { batchId: existingAutoclaveBatch.id, processType: 'Autoclave run' } })
      : 0
    if (cycleCount >= 3) throw new RequestValidationError('A daily batch can contain at most three autoclave cycles.')
    autoclaveCycleNumber = cycleCount + 1
    resolvedBatchId = existingAutoclaveBatch?.id
    activityDetails = JSON.stringify({ ...JSON.parse(details), autoclaveCycleNumber })
  }
  if (!resolvedBatchId && ['Fill jars with rice', 'Fill jars with nutritional broth'].includes(processType)) {
    const prefix = `AC-${localDateCode(activityDateTime)}-`
    const dailyBatch = await tx.batch.findFirst({ where: { batchCode: { startsWith: prefix }, status: 'active' }, orderBy: { createdAt: 'asc' } })
    if (dailyBatch) {
      resolvedBatchId = dailyBatch.id
    } else {
      const batchCode = await nextBatchCode(tx, activityDateTime)
      createdBatch = await tx.batch.create({
        data: { batchCode, jarCount: 0, qrToken: scanToken(), barcodeValue: batchCode, currentStage: processType, currentLocation: 'Preparation' },
      })
      resolvedBatchId = createdBatch.id
    }
  }
  if (resolvedBatchId && processType !== 'Autoclave run') {
    const selectedBatch = await tx.batch.findUnique({ where: { id: resolvedBatchId }, select: { id: true } })
    if (!selectedBatch) throw new RequestValidationError('The selected batch was not found.')
  }
  if (cultureFlaskId) {
    const flask = await tx.cultureFlask.findUnique({ where: { id: cultureFlaskId }, select: { id: true } })
    if (!flask || !processType.startsWith('Liquid culture ')) throw new RequestValidationError('Select a valid liquid culture flask and activity.')
  }
  const activity = await tx.activityLog.create({
        data: {
          type: processType,
          processType,
          activityDateTime,
          timestamp: activityDateTime,
          description: processType,
          operator: operator?.trim() || null,
          notes: notes?.trim() || null,
          detailsJson: activityDetails,
          clientRequestId,
          jarCount: jarCount || null,
          batchId: resolvedBatchId,
        },
  })

  if (cultureFlaskId) {
    const flaskDetails = typeof detailsJson === 'string' ? JSON.parse(detailsJson) as Record<string, string> : detailsJson ?? {}
    const flaskStatus = processType === 'Liquid culture preparation'
      ? 'Prepared'
      : processType === 'Liquid culture inoculation'
        ? 'Active'
        : processType === 'Liquid culture contamination'
          ? 'Contaminated'
          : processType === 'Liquid culture use'
            ? 'Used'
            : undefined
    await tx.cultureFlask.update({
      where: { id: cultureFlaskId },
      data: {
        ...(flaskStatus ? { status: flaskStatus } : {}),
        ...(processType === 'Liquid culture preparation' ? { preparedAt: activityDateTime } : {}),
        ...(flaskDetails.strain ? { strain: flaskDetails.strain } : {}),
        ...(flaskDetails.sourceCulture ? { sourceCulture: flaskDetails.sourceCulture } : {}),
        ...(notes ? { notes: notes.trim() } : {}),
      },
    })
    await tx.cultureFlaskLog.create({ data: { flaskId: cultureFlaskId, activityId: activity.id, action: processType } })
  }

  if (processType === 'Autoclave run') {
  const firstJarSequence = existingAutoclaveBatch?.jarCount ?? 0
  if (existingAutoclaveBatch) {
    createdBatch = await tx.batch.update({ where: { id: existingAutoclaveBatch.id }, data: { jarCount: { increment: jarCount }, currentStage: 'Autoclaved', currentLocation: 'Autoclave', autoclaveActivityId: existingAutoclaveBatch.autoclaveActivityId ?? activity.id } })
  } else {
    const batchCode = await nextBatchCode(tx, activityDateTime)
    createdBatch = await tx.batch.create({
          data: {
            batchCode,
            jarCount,
            qrToken: scanToken(),
            barcodeValue: batchCode,
            currentStage: 'Autoclaved',
            currentLocation: 'Autoclave',
            notes: notes?.trim() || null,
            autoclaveActivityId: activity.id,
          },
  })
  resolvedBatchId = createdBatch.id
  await tx.activityLog.update({ where: { id: activity.id }, data: { batchId: createdBatch.id } })
  }
        if (createJarLabels) {
          await tx.jar.createMany({
            data: Array.from({ length: jarCount }, (_, index) => {
              const sequence = firstJarSequence + index + 1
              const jarCode = `${createdBatch!.batchCode}-J${String(sequence).padStart(3, '0')}`
              return { batchId: createdBatch!.id, jarCode, sequenceNumber: sequence, qrToken: scanToken() }
            }),
          })
        }
      } else if (resolvedBatchId) {
        await tx.batch.update({ where: { id: resolvedBatchId }, data: { currentStage: processType, updatedAt: new Date() } })
      }

      await tx.sensorSnapshot.createMany({ data: sensorSnapshots.map((snapshot) => ({ ...snapshot, activityId: activity.id, batchId: resolvedBatchId, capturedAt: new Date() })) })

      if (selectedJarIds.length) {
  const jars = await tx.jar.findMany({ where: { id: { in: selectedJarIds } } })
  if (jars.length !== selectedJarIds.length) throw new RequestValidationError('One or more selected jars were not found.')
  await tx.activityLog.update({ where: { id: activity.id }, data: { jarId: jars[0].id, batchId: resolvedBatchId ?? jars[0].batchId } })
      }

      return { activityId: activity.id, batchId: resolvedBatchId, batchCode: createdBatch?.batchCode ?? null, autoclaveCycleNumber, idempotent: false }
    })

    res.status(result.idempotent ? 200 : 201).json({ ...result, googleSyncStatus: 'pending' })
  } catch (error) {
    if (!(error instanceof RequestValidationError) && !(error instanceof z.ZodError)) console.error('[activity-save] failed', error)
    next(error)
  }
})

app.use(express.static(staticDirectory))
app.get('*', (_req, res) => res.sendFile(path.join(staticDirectory, 'index.html')))

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const isRequestError = error instanceof RequestValidationError || error instanceof z.ZodError
  if (!isRequestError) console.error('[api] unexpected request failure', error)
  const message = error instanceof RequestValidationError ? error.message : isRequestError ? 'Invalid request.' : 'Unexpected server error.'
  res.status(isRequestError ? 400 : 500).json({ error: message })
})

app.listen(port, () => console.log(`Lab API listening on http://localhost:${port}`))

process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})
