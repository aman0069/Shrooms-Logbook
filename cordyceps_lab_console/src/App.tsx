import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Activity, AlertTriangle, ArrowRightLeft, CalendarDays, Check, ClipboardList, FlaskConical, Layers3, Microscope, Plus, Printer, QrCode, ScanLine, Settings, Snowflake, Syringe, Trash2, Wrench, X, type LucideIcon } from 'lucide-react'

type Batch = {
  id: string
  batchCode: string
  jarCount: number
  currentStage: string
  currentLocation?: string
  status: string
  qrToken: string
  barcodeValue: string
  createdAt?: string
  activityLogs?: Array<{ processType?: string | null }>
}

type Activity = {
  id: string
  processType?: string
  type: string
  activityDateTime: string
  batch?: Batch
  googleSyncStatus: string
  operator?: string | null
  notes?: string | null
  detailsJson?: string | null
  sensorSnapshots?: SensorSnapshot[]
  cultureFlaskLog?: { flask: { flaskCode: string } }
}
type SensorSnapshot = {
  roomLocation: string
  temperatureC: number | null
  temperatureStatus: string
  humidityRh: number | null
  humidityStatus: string
  co2Ppm: number | null
  co2Status: string
  lux: number | null
  luxStatus: string
}
type CultureFlask = {
  id: string
  flaskCode: string
  capacityMl: number
  strain: string
  sourceCulture?: string | null
  status: string
  preparedAt?: string | null
  notes?: string | null
  logs: Array<{ id: string; action: string; createdAt: string; activity: { activityDateTime: string; notes?: string | null; sensorSnapshots: SensorSnapshot[] } }>
}
type PendingActivity = {
  clientRequestId: string
  payload: Record<string, unknown>
}
type ScanPayload = { kind: 'batch' | 'jar'; record: Batch & { jarCode?: string; batch?: Batch } }

const localNow = () => {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const localBatchPrefix = () => {
  const date = new Date()
  return `AC-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-`
}

const sensorValue = (value: number | null, status: string, unit: string) => value === null
  ? status === 'missing' ? 'not mapped' : 'unavailable'
  : `${value}${unit}`

const snapshotSummary = (snapshot: SensorSnapshot) => [
  `T ${sensorValue(snapshot.temperatureC, snapshot.temperatureStatus, '°C')}`,
  `RH ${sensorValue(snapshot.humidityRh, snapshot.humidityStatus, '%')}`,
  `CO2 ${sensorValue(snapshot.co2Ppm, snapshot.co2Status, ' ppm')}`,
  `Light ${sensorValue(snapshot.lux, snapshot.luxStatus, ' lx')}`,
].join(' · ')

const activityLabel = (activity: Activity) => {
  if (activity.processType !== 'Autoclave run') return activity.processType || activity.type
  try {
    const details = JSON.parse(activity.detailsJson || '{}') as { autoclaveCycleNumber?: number }
    return `Autoclave run · Cycle ${details.autoclaveCycleNumber ?? '?'}`
  } catch {
    return 'Autoclave run'
  }
}

const activityDetailEntries = (activity: Activity) => {
  try {
    const details: unknown = JSON.parse(activity.detailsJson || '{}')
    return details && typeof details === 'object' && !Array.isArray(details) ? Object.entries(details) : []
  } catch {
    return []
  }
}

const displayDetailValue = (value: unknown) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  ? String(value)
  : JSON.stringify(value)

const requestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const apiUrl = (path: string) => `api/${path.replace(/^\//, '')}`
const pendingActivitiesKey = 'cordyceps.pendingActivities'
const settingsKey = 'cordyceps.labSettings'

type SensorInput = {
  roomLocation: string
  metric: 'temperature' | 'humidity' | 'co2' | 'lux'
  entityId: string
}

type ActivityTab = {
  id: string
  label: string
  process?: string
  description: string
  Icon: LucideIcon
  animation: { y?: number[]; x?: number[]; rotate?: number[]; scale?: number[]; opacity?: number[] }
}

const activityTabs: ActivityTab[] = [
  { id: 'autoclave', label: 'Autoclave', process: 'Autoclave run', description: 'Uses Config recipes on every jar. Up to three cycles join today’s batch.', Icon: FlaskConical, animation: { rotate: [0, 12, -12, 0], scale: [1, 1.05, 1] } },
  { id: 'cooling', label: 'Cooling', process: 'Cooling observation', description: 'Record the batch after the autoclave load cools.', Icon: Snowflake, animation: { rotate: [0, 45, 90, 135, 180, 225, 270, 315, 360] } },
  { id: 'liquid-culture', label: 'Liquid culture', description: 'Manage the 46 individually identified 500 ml flasks.', Icon: FlaskConical, animation: { y: [0, -5, 0], rotate: [0, 8, -8, 0] } },
  { id: 'inoculation', label: 'Inoculation', process: 'Inoculation', description: 'Record culture source and inoculation details.', Icon: Syringe, animation: { x: [0, 8, 0], y: [0, -3, 0] } },
  { id: 'incubation', label: 'Incubation', process: 'Incubation observation', description: 'Log growth checks and observations.', Icon: Microscope, animation: { scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] } },
  { id: 'transfer', label: 'Transfer', process: 'Dark-room to light-room transfer', description: 'Move jars to the light room when ready.', Icon: ArrowRightLeft, animation: { x: [0, 12, 0], rotate: [0, 4, 0] } },
  { id: 'harvest', label: 'Harvest', process: 'Harvest', description: 'Record fresh and dry yield.', Icon: Check, animation: { rotate: [0, -12, 12, 0], scale: [1, 1.08, 1] } },
  { id: 'contamination', label: 'Contamination', process: 'Contamination observation', description: 'Flag affected jars and record the cause.', Icon: AlertTriangle, animation: { x: [0, -5, 5, -5, 0], opacity: [1, 0.6, 1] } },
  { id: 'cleaning', label: 'Cleaning', process: 'Cleaning / sanitation', description: 'Record cleaning and sanitation work.', Icon: Check, animation: { rotate: [0, 90, 180, 270, 360] } },
  { id: 'maintenance', label: 'Maintenance', process: 'Equipment maintenance', description: 'Track equipment checks and service.', Icon: Wrench, animation: { rotate: [0, -18, 18, 0] } },
  { id: 'other', label: 'Other', process: 'Other / custom activity', description: 'Record a custom lab activity.', Icon: ClipboardList, animation: { y: [0, -4, 0], rotate: [0, -3, 3, 0] } },
]

type AppSettings = {
  operatorName: string
  defaultJarCount: number
  riceRecipe: string
  riceAmountPerJarG: string
  nutritionRecipe: string
  nutritionVolumePerJarMl: string
  createJarLabels: boolean
  sensors: SensorInput[]
}

const defaultSettings: AppSettings = {
  operatorName: '',
  defaultJarCount: 75,
  riceRecipe: '',
  riceAmountPerJarG: '',
  nutritionRecipe: '',
  nutritionVolumePerJarMl: '',
  createJarLabels: true,
  sensors: [],
}

function loadSettings(): AppSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(settingsKey) || '{}') as Partial<AppSettings>
    return {
      ...defaultSettings,
      ...saved,
      defaultJarCount: Number.isInteger(saved.defaultJarCount) ? Math.min(75, Math.max(1, saved.defaultJarCount!)) : defaultSettings.defaultJarCount,
      riceRecipe: typeof saved.riceRecipe === 'string' ? saved.riceRecipe : typeof (saved as Record<string, unknown>).ricePreparation === 'string' ? String((saved as Record<string, unknown>).ricePreparation) : '',
      nutritionRecipe: typeof saved.nutritionRecipe === 'string' ? saved.nutritionRecipe : typeof (saved as Record<string, unknown>).nutritionPreparation === 'string' ? String((saved as Record<string, unknown>).nutritionPreparation) : '',
      sensors: Array.isArray(saved.sensors) ? saved.sensors.filter((sensor): sensor is SensorInput => Boolean(sensor && typeof sensor.roomLocation === 'string' && typeof sensor.entityId === 'string' && ['temperature', 'humidity', 'co2', 'lux'].includes(sensor.metric))) : [],
    }
  } catch {
    return defaultSettings
  }
}

async function readJson<T>(response: Response, endpoint: string): Promise<T> {
  const body = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    const preview = body.replace(/\s+/g, ' ').trim().slice(0, 160)
    throw new Error(`${endpoint} returned invalid JSON (${response.status}): ${preview || 'empty response'}`)
  }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload ? String(payload.error) : `HTTP ${response.status}`
    throw new Error(`${endpoint} failed: ${message}`)
  }
  return payload as T
}

function App() {
  const query = new URLSearchParams(window.location.search)
  const [batches, setBatches] = useState<Batch[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [cultureFlasks, setCultureFlasks] = useState<CultureFlask[]>([])
  const [activeTab, setActiveTab] = useState(() => activityTabs.find((tab) => tab.process === query.get('process'))?.id ?? 'autoclave')
  const [selectedProcess, setSelectedProcess] = useState<string | null>(query.get('process'))
  const [activityDateTime, setActivityDateTime] = useState(localNow)
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [showConfig, setShowConfig] = useState(false)
  const [notes, setNotes] = useState('')
  const [jarCount, setJarCount] = useState('')
  const [details, setDetails] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [labelBatch, setLabelBatch] = useState<Batch | null>(null)
  const [scanPayload, setScanPayload] = useState<ScanPayload | null>(null)
  const [scanError, setScanError] = useState('')
  const [prefilledBatchId, setPrefilledBatchId] = useState<string | undefined>(query.get('batchId') || undefined)
  const [clientRequestId, setClientRequestId] = useState(requestId)
  const [cultureFlaskId, setCultureFlaskId] = useState('')
  const [cultureFlaskAction, setCultureFlaskAction] = useState('Liquid culture preparation')
  const [cultureFlaskStrain, setCultureFlaskStrain] = useState('Cordyceps militaris')
  const [cultureFlaskSource, setCultureFlaskSource] = useState('')
  const [cultureFlaskNotes, setCultureFlaskNotes] = useState('')
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null)
  const qrRef = useRef<HTMLImageElement>(null)
  const barcodeRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(settingsKey, JSON.stringify(settings))
    } catch {
      setFeedback({ kind: 'error', text: 'Settings could not be saved in this browser.' })
    }
  }, [settings])

  const refresh = async () => {
    const [batchResponse, activityResponse, flaskResponse] = await Promise.all([fetch(apiUrl('batches')), fetch(apiUrl('activities')), fetch(apiUrl('culture-flasks'))])
    const [batchData, activityData, flaskData] = await Promise.all([
      readJson<Batch[]>(batchResponse, 'Batches API'),
      readJson<Activity[]>(activityResponse, 'Activities API'),
      readJson<CultureFlask[]>(flaskResponse, 'Culture flasks API'),
    ])
    setBatches(batchData)
    setActivities(activityData)
    setCultureFlasks(flaskData)
  }

  const replayPendingActivities = async () => {
    const pending = JSON.parse(localStorage.getItem(pendingActivitiesKey) || '[]') as PendingActivity[]
    if (!pending.length) return
    const remaining: PendingActivity[] = []
    for (const item of pending) {
      try {
        const response = await fetch(apiUrl('activities'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.payload) })
        await readJson(response, 'Activity retry')
      } catch {
        remaining.push(item)
      }
    }
    localStorage.setItem(pendingActivitiesKey, JSON.stringify(remaining))
    if (remaining.length !== pending.length) await refresh()
  }

  useEffect(() => {
    refresh().then(replayPendingActivities).catch((error: Error) => setFeedback({ kind: 'error', text: error.message }))
  }, [])

  useEffect(() => {
    if (!cultureFlaskId && cultureFlasks[0]) setCultureFlaskId(cultureFlasks[0].id)
  }, [cultureFlaskId, cultureFlasks])

  useEffect(() => {
    const selectedFlask = cultureFlasks.find((flask) => flask.id === cultureFlaskId)
    if (!selectedFlask) return
    setCultureFlaskStrain(selectedFlask.strain)
    setCultureFlaskSource(selectedFlask.sourceCulture || '')
  }, [cultureFlaskId, cultureFlasks])

  useEffect(() => {
    if (!labelBatch || !qrRef.current || !barcodeRef.current) return
    QRCode.toDataURL(`${window.location.origin}/lab-scan?t=${labelBatch.qrToken}`, { margin: 1, width: 220 })
      .then((url) => { if (qrRef.current) qrRef.current.src = url })
    JsBarcode(barcodeRef.current, labelBatch.barcodeValue, { format: 'CODE128', displayValue: true, height: 52, margin: 4 })
  }, [labelBatch])

  useEffect(() => {
    if (window.location.pathname !== '/lab-scan') return
    const token = new URLSearchParams(window.location.search).get('t')
    if (!token) { setScanError('Label not found.'); return }
    fetch(`${apiUrl('lab-scan')}?t=${encodeURIComponent(token)}`)
      .then(async (response) => {
        setScanPayload(await readJson<ScanPayload>(response, 'Lab scan API'))
      })
      .catch((error: Error) => setScanError(error.message))
  }, [])

  const openActivity = (process: string) => {
    const matchingTab = activityTabs.find((tab) => tab.process === process)
    if (matchingTab) setActiveTab(matchingTab.id)
    setSelectedProcess(process)
    setActivityDateTime(localNow())
    setNotes('')
    const dailyPrep = process === 'Autoclave run'
    const queryBatch = query.get('batchId') ? batches.find((batch) => batch.id === query.get('batchId')) : undefined
    const selectedBatch = queryBatch ?? (dailyPrep ? batches.find((batch) => batch.batchCode.startsWith(localBatchPrefix())) : batches[0])
    setPrefilledBatchId(selectedBatch?.id)
    setJarCount(process === 'Autoclave run' ? String(settings.defaultJarCount) : String(selectedBatch?.jarCount ?? ''))
    setDetails({})
    setClientRequestId(requestId())
    setFeedback(null)
  }

  const saveActivity = async () => {
    if (!selectedProcess) return
    if (!settings.operatorName.trim()) {
      setFeedback({ kind: 'error', text: 'Set the operator name in Config before saving an activity.' })
      setShowConfig(true)
      return
    }
    if (selectedProcess === 'Autoclave run' && (Number(jarCount) < 1 || Number(jarCount) > 75)) {
      setFeedback({ kind: 'error', text: 'An autoclave load must contain 1 to 75 jars.' })
      return
    }
    setSaving(true)
    setFeedback(null)
    const requestDetails = { ...details, riceRecipe: settings.riceRecipe, riceAmountPerJarG: settings.riceAmountPerJarG, nutritionRecipe: settings.nutritionRecipe, nutritionVolumePerJarMl: settings.nutritionVolumePerJarMl }
    const requestPayload = { processType: selectedProcess, activityDateTime: localNow(), operator: settings.operatorName.trim(), notes, jarCount: jarCount ? Number(jarCount) : undefined, detailsJson: JSON.stringify(requestDetails), createJarLabels: settings.createJarLabels, batchId: prefilledBatchId, sensorInputs: settings.sensors.filter((sensor) => sensor.entityId.trim()).map((sensor) => ({ ...sensor, entityId: sensor.entityId.trim() })), clientRequestId }
    try {
      const response = await fetch(apiUrl('activities'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      })
      const result = await readJson<{ batchCode?: string }>(response, 'Activity API')
      await refresh()
      setSelectedProcess(null)
      setFeedback({ kind: 'success', text: result.batchCode ? `Saved. New batch ${result.batchCode} created.` : 'Activity saved locally.' })
    } catch (error) {
      const pending = JSON.parse(localStorage.getItem(pendingActivitiesKey) || '[]') as PendingActivity[]
      localStorage.setItem(pendingActivitiesKey, JSON.stringify([...pending.filter((item) => item.clientRequestId !== clientRequestId), { clientRequestId, payload: requestPayload }]))
      setFeedback({ kind: 'error', text: `${error instanceof Error ? error.message : 'The activity could not be saved.'} It is queued for retry.` })
    } finally {
      setSaving(false)
    }
  }

  const printLabel = () => {
    const image = qrRef.current
    if (image && !image.complete) {
      image.addEventListener('load', () => window.print(), { once: true })
      return
    }
    window.print()
  }

  const saveCultureFlaskActivity = async () => {
    if (!settings.operatorName.trim()) {
      setFeedback({ kind: 'error', text: 'Set the operator name in Config before logging activities.' })
      setShowConfig(true)
      return
    }
    if (!cultureFlaskId) {
      setFeedback({ kind: 'error', text: 'Select a liquid culture flask first.' })
      return
    }
    const id = requestId()
    const payload = {
      processType: cultureFlaskAction,
      activityDateTime: localNow(),
      operator: settings.operatorName.trim(),
      cultureFlaskId,
      detailsJson: { strain: cultureFlaskStrain, sourceCulture: cultureFlaskSource },
      notes: cultureFlaskNotes,
      sensorInputs: settings.sensors.filter((sensor) => sensor.entityId.trim()).map((sensor) => ({ ...sensor, entityId: sensor.entityId.trim() })),
      clientRequestId: id,
    }
    setSaving(true)
    setFeedback(null)
    try {
      const response = await fetch(apiUrl('activities'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      await readJson(response, 'Culture flask activity API')
      await refresh()
      setCultureFlaskNotes('')
      setFeedback({ kind: 'success', text: `${cultureFlaskAction} logged for ${cultureFlasks.find((flask) => flask.id === cultureFlaskId)?.flaskCode}.` })
    } catch (error) {
      const pending = JSON.parse(localStorage.getItem(pendingActivitiesKey) || '[]') as PendingActivity[]
      localStorage.setItem(pendingActivitiesKey, JSON.stringify([...pending.filter((item) => item.clientRequestId !== id), { clientRequestId: id, payload }]))
      setFeedback({ kind: 'error', text: `${error instanceof Error ? error.message : 'The flask entry could not be saved.'} It is queued for retry.` })
    } finally {
      setSaving(false)
    }
  }

  const detailFields = selectedProcess === 'Autoclave run'
    ? [['jarSize', 'Jar size / type'], ['cycle', 'Cycle / program'], ['startTime', 'Start time'], ['endTime', 'End time'], ['pressure', 'Pressure'], ['temperature', 'Temperature']]
    : selectedProcess === 'Harvest'
      ? [['freshYield', 'Fresh yield (g)'], ['dryYield', 'Dry yield (g)'], ['dryingMethod', 'Drying method'], ['quality', 'Quality observation']]
      : selectedProcess === 'Inoculation'
        ? [['cultureBatch', 'Culture batch / reference'], ['volumePerJar', 'Volume per jar (ml)'], ['method', 'Inoculation method']]
        : [['workPerformed', 'Work performed'], ['location', 'Area / equipment'], ['material', 'Material / chemical used']]

  const setDetail = (key: string, value: string) => setDetails((current) => ({ ...current, [key]: value }))
  const todayCount = activities.filter((activity) => activity.activityDateTime.slice(0, 10) === new Date().toISOString().slice(0, 10)).length
  const stats = [
    { label: 'Today', value: todayCount, Icon: CalendarDays },
    { label: 'Batches', value: batches.length, Icon: Layers3 },
    { label: 'Pending sync', value: activities.filter((activity) => activity.googleSyncStatus !== 'synced').length, Icon: Activity },
  ]
  const currentTab = activityTabs.find((tab) => tab.id === activeTab) ?? activityTabs[0]
  const selectedCultureFlask = cultureFlasks.find((flask) => flask.id === cultureFlaskId)
  const todayAutoclaveCycles = activities.filter((activity) => activity.processType === 'Autoclave run' && new Date(activity.activityDateTime).toDateString() === new Date().toDateString()).length

  if (window.location.pathname === '/lab-scan') {
    const record = scanPayload?.record
    const batch = scanPayload?.kind === 'jar' ? record?.batch : record
    return (
      <div className="light-lab min-h-screen bg-[#f6f8f4] p-5 text-slate-900">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-700">Cordyceps Lab</p>
          {scanError ? <><h1 className="mt-5 text-3xl font-semibold text-slate-900">Label not found</h1><p className="mt-3 text-slate-600">This QR or barcode is invalid or no longer registered.</p></> : record && batch ? <><h1 className="mt-5 text-3xl font-semibold text-slate-900">{scanPayload.kind === 'jar' ? record.jarCode : batch.batchCode}</h1><p className="mt-2 text-slate-600">{batch.currentStage} · {batch.currentLocation || 'Location not recorded'}</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><button onClick={() => { window.location.href = `/?batchId=${batch.id}&process=Inoculation` }} className="min-h-14 rounded-lg bg-emerald-700 font-semibold text-white">Inoculation</button><button onClick={() => { window.location.href = `/?batchId=${batch.id}&process=Incubation%20observation` }} className="min-h-14 rounded-lg border border-slate-300 text-slate-800">Incubation observation</button><button onClick={() => { window.location.href = `/?batchId=${batch.id}&process=Dark-room%20to%20light-room%20transfer` }} className="min-h-14 rounded-lg border border-slate-300 text-slate-800">Dark-to-light transfer</button><button onClick={() => { window.location.href = `/?batchId=${batch.id}&process=Harvest` }} className="min-h-14 rounded-lg border border-slate-300 text-slate-800">Harvest</button><button onClick={() => { window.location.href = `/?batchId=${batch.id}&process=Contamination%20observation` }} className="min-h-14 rounded-lg border border-rose-300 text-rose-800">Contamination</button></div></> : <p className="mt-6 text-slate-600">Looking up label...</p>}
        </div>
      </div>
    )
  }

  if (showConfig) {
    return (
      <div className="light-lab min-h-screen bg-[#f6f8f4] p-4 text-slate-900 sm:p-6">
        <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div><p className="text-xs uppercase tracking-[0.3em] text-cyan-400">Cordyceps Lab</p><h1 className="mt-2 text-2xl font-semibold text-slate-900">Config</h1></div>
            <button onClick={() => setShowConfig(false)} aria-label="Back to logbook" title="Back to logbook" className="rounded-lg border border-slate-700 p-3 text-slate-200"><X /></button>
          </div>
          {feedback && <p className={`mb-5 rounded-lg border px-4 py-3 ${feedback.kind === 'success' ? 'border-emerald-400/40 text-emerald-200' : 'border-rose-400/40 text-rose-200'}`}>{feedback.text}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field sm:col-span-2">Operator name<input autoComplete="name" value={settings.operatorName} onChange={(event) => setSettings((current) => ({ ...current, operatorName: event.target.value }))} placeholder="Set your name once" /></label>
            <label className="field">Default autoclave load<input type="number" min="1" max="75" value={settings.defaultJarCount} onChange={(event) => setSettings((current) => ({ ...current, defaultJarCount: Math.min(75, Math.max(1, Number(event.target.value) || 1)) }))} /></label>
            <label className="field">Create jar labels<input type="checkbox" checked={settings.createJarLabels} onChange={(event) => setSettings((current) => ({ ...current, createJarLabels: event.target.checked }))} className="h-5 w-5 accent-cyan-400" /></label>
            <label className="field sm:col-span-2">Rice recipe<input value={settings.riceRecipe} onChange={(event) => setSettings((current) => ({ ...current, riceRecipe: event.target.value }))} placeholder="Set recipe in Config" /></label>
            <label className="field sm:col-span-2">Dry rice per jar (g)<input type="number" min="0" step="any" value={settings.riceAmountPerJarG} onChange={(event) => setSettings((current) => ({ ...current, riceAmountPerJarG: event.target.value }))} placeholder="Set amount in Config" /></label>
            <label className="field sm:col-span-2">Nutrition recipe<input value={settings.nutritionRecipe} onChange={(event) => setSettings((current) => ({ ...current, nutritionRecipe: event.target.value }))} placeholder="Set recipe in Config" /></label>
            <label className="field sm:col-span-2">Nutrition per jar (ml)<input type="number" min="0" step="any" value={settings.nutritionVolumePerJarMl} onChange={(event) => setSettings((current) => ({ ...current, nutritionVolumePerJarMl: event.target.value }))} placeholder="Set amount in Config" /></label>
          </div>
          <section className="mt-7 border-t border-slate-200 pt-6">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">Automatic sensor capture</h2><p className="mt-1 text-sm text-slate-600">Read these Home Assistant entities whenever an activity is saved.</p></div><button onClick={() => setSettings((current) => ({ ...current, sensors: [...current.sensors, { roomLocation: 'Culture room', metric: 'temperature', entityId: '' }] }))} aria-label="Add sensor" title="Add sensor" className="rounded-lg border border-slate-300 p-2 text-slate-700"><Plus className="h-5 w-5" /></button></div>
            {settings.sensors.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">No sensor entities configured.</p>}
            <div className="space-y-3">{settings.sensors.map((sensor, index) => <div key={`${sensor.roomLocation}-${sensor.metric}-${index}`} className="grid items-end gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
              <label className="field">Room<input value={sensor.roomLocation} onChange={(event) => setSettings((current) => ({ ...current, sensors: current.sensors.map((item, itemIndex) => itemIndex === index ? { ...item, roomLocation: event.target.value } : item) }))} placeholder="Culture room" /></label>
              <label className="field">Reading<select value={sensor.metric} onChange={(event) => setSettings((current) => ({ ...current, sensors: current.sensors.map((item, itemIndex) => itemIndex === index ? { ...item, metric: event.target.value as SensorInput['metric'] } : item) }))}><option value="temperature">Temperature</option><option value="humidity">Humidity</option><option value="co2">CO2</option><option value="lux">Light</option></select></label>
              <label className="field">Home Assistant entity<input value={sensor.entityId} onChange={(event) => setSettings((current) => ({ ...current, sensors: current.sensors.map((item, itemIndex) => itemIndex === index ? { ...item, entityId: event.target.value } : item) }))} placeholder="sensor.culture_room_temperature" /></label>
              <button onClick={() => setSettings((current) => ({ ...current, sensors: current.sensors.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Remove ${sensor.metric} sensor`} title="Remove sensor" className="min-h-11 rounded-lg border border-slate-300 p-2 text-slate-600"><Trash2 className="h-5 w-5" /></button>
            </div>)}</div>
          </section>
          <p className="mt-5 text-sm text-slate-600">Defaults are stored in this browser. Timestamps are filled from the current local time. HA add-on sensor reads use its Supervisor token.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="light-lab min-h-screen bg-[#f6f8f4] text-slate-900">
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div><p className="text-xs uppercase tracking-[0.25em] text-emerald-700">Cordyceps Lab</p><h1 className="mt-2 text-2xl font-semibold text-slate-900">Cultivation logbook</h1></div>
          <div className="flex flex-wrap items-center gap-2"><button onClick={() => setShowConfig(true)} aria-label="Config" title="Config" className="flex min-h-12 items-center gap-2 rounded-lg border border-slate-300 px-4 text-slate-700"><Settings className="h-5 w-5" /> Config</button>{currentTab.process && <button onClick={() => openActivity(currentTab.process!)} className="flex min-h-12 items-center gap-2 rounded-lg bg-emerald-700 px-4 font-semibold text-white"><ClipboardList className="h-5 w-5" /> Log {currentTab.label}</button>}</div>
        </header>

        <nav aria-label="Cultivation process" role="tablist" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {activityTabs.map((tab) => <button key={tab.id} id={`tab-${tab.id}`} role="tab" aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={`flex min-h-28 flex-col items-start justify-between rounded-xl border p-4 text-left transition-colors ${activeTab === tab.id ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-500 hover:bg-emerald-50'}`}>
            <motion.span animate={activeTab === tab.id ? tab.animation : {}} transition={{ duration: 1.3, repeat: activeTab === tab.id ? Infinity : 0, ease: 'easeInOut' }}><tab.Icon className={`h-5 w-5 ${activeTab === tab.id ? 'text-white' : 'text-emerald-700'}`} /></motion.span><span className="font-medium">{tab.label}</span>
          </button>)}
        </nav>

        <AnimatePresence mode="wait">
          <motion.section key={currentTab.id} id={`panel-${currentTab.id}`} role="tabpanel" aria-labelledby={`tab-${currentTab.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-start gap-3"><currentTab.Icon className="mt-1 h-6 w-6 shrink-0 text-emerald-700" /><div><h2 className="text-lg font-semibold text-slate-900">{currentTab.label}</h2><p className="mt-1 text-sm text-slate-600">{currentTab.description}</p></div></div>
            {currentTab.id === 'liquid-culture' ? <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              <div className="grid content-start gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="field">500 ml flask<select value={cultureFlaskId} onChange={(event) => setCultureFlaskId(event.target.value)}><option value="">Select flask</option>{cultureFlasks.map((flask) => <option key={flask.id} value={flask.id}>{flask.flaskCode} · {flask.status}</option>)}</select></label>
                <label className="field">Liquid culture action<select value={cultureFlaskAction} onChange={(event) => setCultureFlaskAction(event.target.value)}><option>Liquid culture preparation</option><option>Liquid culture inoculation</option><option>Liquid culture observation</option><option>Liquid culture contamination</option><option>Liquid culture use</option></select></label>
                <label className="field">Strain<input value={cultureFlaskStrain} onChange={(event) => setCultureFlaskStrain(event.target.value)} /></label>
                <label className="field">Source culture<input value={cultureFlaskSource} onChange={(event) => setCultureFlaskSource(event.target.value)} placeholder="Parent culture or batch" /></label>
                <label className="field">Notes<textarea value={cultureFlaskNotes} onChange={(event) => setCultureFlaskNotes(event.target.value)} rows={2} /></label>
                <button disabled={saving || !cultureFlasks.length} onClick={saveCultureFlaskActivity} className="min-h-12 rounded-lg bg-emerald-700 px-4 font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Log flask activity'}</button>
                {selectedCultureFlask && <section className="border-t border-slate-200 pt-4"><h3 className="mb-3 font-semibold text-slate-900">History · {selectedCultureFlask.flaskCode}</h3>{selectedCultureFlask.logs.length === 0 ? <p className="text-sm text-slate-500">No entries recorded yet.</p> : <div className="space-y-3">{selectedCultureFlask.logs.map((log) => <article key={log.id} className="border-l-2 border-emerald-600 pl-3"><p className="font-medium text-slate-800">{log.action}</p><p className="text-xs text-slate-500">{new Date(log.activity.activityDateTime || log.createdAt).toLocaleString('en-IN')}</p>{log.activity.notes && <p className="mt-1 text-sm text-slate-600">{log.activity.notes}</p>}{log.activity.sensorSnapshots.map((snapshot) => <p key={`${log.id}-${snapshot.roomLocation}`} className="mt-1 text-xs text-slate-500">{snapshot.roomLocation}: {snapshotSummary(snapshot)}</p>)}</article>)}</div>}</section>}
              </div>
              <div className="overflow-x-auto"><table className="w-full min-w-[58rem] text-left text-sm"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="p-3">Flask</th><th className="p-3">Strain</th><th className="p-3">Source</th><th className="p-3">Prepared</th><th className="p-3">Status</th><th className="p-3">Notes / last action</th></tr></thead><tbody>{cultureFlasks.map((flask) => <tr key={flask.id} className="border-b border-slate-100 align-top"><td className="p-3 font-semibold text-slate-900">{flask.flaskCode}<span className="ml-2 text-xs font-normal text-slate-500">{flask.capacityMl} ml</span></td><td className="p-3 text-slate-700">{flask.strain}</td><td className="p-3 text-slate-700">{flask.sourceCulture || '—'}</td><td className="p-3 text-slate-700">{flask.preparedAt ? new Date(flask.preparedAt).toLocaleDateString('en-IN') : '—'}</td><td className="p-3 text-slate-700">{flask.status}</td><td className="p-3 text-slate-600"><span>{flask.logs[0]?.action || 'No action'}</span>{flask.notes && <span className="mt-1 block text-xs">{flask.notes}</span>}</td></tr>)}</tbody></table></div>
            </div> : <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-emerald-50 p-4"><div><p className="font-medium text-slate-900">{currentTab.id === 'autoclave' ? `Today’s autoclave cycles: ${todayAutoclaveCycles} of 3` : currentTab.process}</p><p className="mt-1 text-sm text-slate-600">{settings.sensors.filter((sensor) => sensor.entityId.trim()).length} sensor mappings will be read when you save.</p></div>{currentTab.process && <button onClick={() => openActivity(currentTab.process!)} className="min-h-11 rounded-lg bg-emerald-700 px-4 font-semibold text-white">Log {currentTab.label}</button>}</div>}
          </motion.section>
        </AnimatePresence>

        {feedback && <div className={`mb-5 flex items-center gap-3 rounded-xl border px-4 py-3 ${feedback.kind === 'success' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-rose-400/40 bg-rose-400/10 text-rose-200'}`}>{feedback.kind === 'success' ? <Check /> : <X />}{feedback.text}</div>}

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          {stats.map(({ label, value, Icon }) => <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5"><div className="flex items-center justify-between text-slate-400"><span>{label}</span><Icon className="h-5 w-5 text-cyan-400" /></div><div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div></div>)}
        </section>

        <main className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">Daily batches</h2><span className="text-sm text-slate-500">{batches.length}</span></div>{batches.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">Start today’s batch in the Autoclave card.</p> : <div className="space-y-3">{batches.map((batch) => <div key={batch.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.15em] text-emerald-700">{batch.batchCode}</p><p className="mt-1 text-slate-600">{batch.jarCount} jars · {batch.activityLogs?.filter((log) => log.processType === 'Autoclave run').length ?? 0} autoclave cycles</p></div><span className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700">{batch.currentStage}</span></div><div className="mt-4 flex gap-2"><button onClick={() => setLabelBatch(batch)} aria-label={`Print label for ${batch.batchCode}`} title="Print label" className="flex min-h-11 items-center gap-2 rounded-lg border border-emerald-700/30 px-3 text-emerald-800"><QrCode className="h-4 w-4" /> Label</button><a href={`/lab-scan?t=${batch.qrToken}`} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-slate-700"><ScanLine className="h-4 w-4" /> Scan</a></div></div>)}</div>}</section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">Recent activities</h2><FlaskConical className="h-5 w-5 text-emerald-700" /></div><div className="divide-y divide-slate-100">{activities.length === 0 ? <p className="py-3 text-slate-500">No saved activities yet.</p> : activities.slice(0, 8).map((activity) => {
            const isExpanded = expandedActivityId === activity.id
            const details = activityDetailEntries(activity)
            return <article key={activity.id} className="py-2">
              <button type="button" aria-expanded={isExpanded} aria-controls={`activity-details-${activity.id}`} onClick={() => setExpandedActivityId(isExpanded ? null : activity.id)} className="w-full rounded-lg px-3 py-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
                <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-slate-900">{activityLabel(activity)}</span><span className="text-xs text-slate-500">{new Date(activity.activityDateTime).toLocaleString('en-IN')}</span></span>
                <span className="mt-1 block text-sm text-slate-600">{activity.batch?.batchCode || activity.cultureFlaskLog?.flask.flaskCode || 'Unassigned'} · {isExpanded ? 'Hide details' : 'View details'}</span>
              </button>
              {isExpanded && <div id={`activity-details-${activity.id}`} className="mx-3 mb-3 space-y-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
                <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2"><div><dt className="text-xs uppercase text-slate-500">Operator</dt><dd>{activity.operator || 'Not recorded'}</dd></div><div><dt className="text-xs uppercase text-slate-500">Sync</dt><dd>{activity.googleSyncStatus}</dd></div></dl>
                {activity.notes && <div><h3 className="text-xs uppercase text-slate-500">Notes</h3><p className="mt-1 whitespace-pre-wrap">{activity.notes}</p></div>}
                {details.length > 0 && <div><h3 className="text-xs uppercase text-slate-500">Entry details</h3><dl className="mt-1 grid gap-x-4 gap-y-2 sm:grid-cols-2">{details.map(([key, value]) => <div key={key}><dt className="text-slate-500">{key.replace(/([A-Z])/g, ' $1')}</dt><dd className="break-words">{displayDetailValue(value)}</dd></div>)}</dl></div>}
                {activity.sensorSnapshots?.length ? <div><h3 className="text-xs uppercase text-slate-500">Environment at entry</h3><div className="mt-1 space-y-1">{activity.sensorSnapshots.map((snapshot) => <p key={`${activity.id}-${snapshot.roomLocation}`}>{snapshot.roomLocation}: {snapshotSummary(snapshot)}</p>)}</div></div> : <p className="text-xs text-slate-500">No sensor snapshot attached.</p>}
              </div>}
            </article>
          })}</div></section>
        </main>
      </div>

      {selectedProcess && (
        <div className="fixed inset-0 z-20 overflow-y-auto bg-slate-950/90 p-4 backdrop-blur-sm">
          <div className="mx-auto max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-start justify-between">
              <div><p className="text-xs uppercase tracking-[0.25em] text-cyan-400">Add activity</p><h2 className="mt-2 text-2xl font-semibold text-slate-900">{selectedProcess}</h2></div>
              <button onClick={() => setSelectedProcess(null)} aria-label="Close activity" className="rounded-lg p-3 text-slate-400"><X /></button>
            </div>
            <div className="mb-5 grid gap-3 sm:grid-cols-2">
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">Activity date and time<input type="datetime-local" value={activityDateTime} readOnly /></label>
              <label className="field">Operator<input value={settings.operatorName} readOnly placeholder="Set in Config" /></label>
              {selectedProcess !== 'Incubation observation' && <label className="field">Number of jars<input type="number" min="1" max={selectedProcess === 'Autoclave run' ? 75 : undefined} inputMode="numeric" value={jarCount} readOnly /></label>}
              {detailFields.map(([key, label]) => <label className="field" key={key}>{label}<input value={details[key] || ''} readOnly={key === 'workPerformed' && (selectedProcess === 'Fill jars with rice' || selectedProcess === 'Fill jars with nutritional broth')} onChange={(event) => setDetail(key, event.target.value)} /></label>)}
              <label className="field sm:col-span-2">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="What happened?" /></label>
            </div>
            {selectedProcess === 'Autoclave run' && <label className="mt-4 flex items-center gap-3 rounded-xl border border-slate-700 p-4 text-slate-200"><input type="checkbox" checked={settings.createJarLabels} disabled className="h-5 w-5" />Create individual QR labels for every jar</label>}
            <div className="mt-6 flex justify-end gap-3"><button onClick={() => setSelectedProcess(null)} className="min-h-12 rounded-xl border border-slate-700 px-5 text-slate-300">Cancel</button><button disabled={saving} onClick={saveActivity} className="min-h-12 rounded-xl bg-cyan-400 px-6 font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving locally...' : 'Save activity'}</button></div>
          </div>
        </div>
      )}

      {labelBatch && <div className="fixed inset-0 z-30 overflow-y-auto bg-slate-950/90 p-4"><div className="mx-auto max-w-xl rounded-xl bg-white p-8 text-slate-950"><div className="flex justify-end print:hidden"><button onClick={() => setLabelBatch(null)}><X /></button></div><div className="text-center"><p className="text-sm font-semibold uppercase tracking-[0.3em]">Cordyceps Lab</p><h2 className="mt-4 text-4xl font-bold">{labelBatch.batchCode}</h2><img ref={qrRef} alt={`QR code for ${labelBatch.batchCode}`} className="mx-auto my-4 h-48 w-48" /><svg ref={barcodeRef} className="mx-auto max-w-full" /><p className="mt-4 text-sm">Autoclave date: {new Date(labelBatch.createdAt || Date.now()).toLocaleDateString('en-IN')} · {labelBatch.jarCount} jars</p></div><button onClick={() => window.print()} className="print:hidden mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-white"><Printer className="h-5 w-5" /> Print label</button></div></div>}
    </div>
  )
}

export default App
