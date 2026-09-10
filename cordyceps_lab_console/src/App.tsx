import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { Activity, CalendarDays, Check, ClipboardList, FlaskConical, Layers3, Printer, QrCode, ScanLine, X } from 'lucide-react'

const processes = [
  ['Autoclave run', 'Create batch', '⚗'],
  ['Fill jars with rice', 'Rice preparation', '◉'],
  ['Fill jars with nutritional broth', 'Broth preparation', '◌'],
  ['Inoculation', 'Start culture', '✦'],
  ['Incubation observation', 'Record growth', '◒'],
  ['Dark-room to light-room transfer', 'Move jars', '→'],
  ['Harvest', 'Record yield', '✂'],
  ['Contamination observation', 'Flag a concern', '!'],
  ['Cleaning / sanitation', 'Keep the lab ready', '⌁'],
  ['Equipment maintenance', 'Service equipment', '⚙'],
  ['Other / custom activity', 'Add a note', '+'],
] as const

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
}

type Activity = {
  id: string
  processType?: string
  type: string
  activityDateTime: string
  batch?: Batch
  googleSyncStatus: string
}
type ScanPayload = { kind: 'batch' | 'jar'; record: Batch & { jarCode?: string; batch?: Batch } }

const localNow = () => {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function App() {
  const query = new URLSearchParams(window.location.search)
  const [batches, setBatches] = useState<Batch[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [selectedProcess, setSelectedProcess] = useState<string | null>(query.get('process'))
  const [activityDateTime, setActivityDateTime] = useState(localNow)
  const [operator, setOperator] = useState('')
  const [notes, setNotes] = useState('')
  const [jarCount, setJarCount] = useState('')
  const [details, setDetails] = useState<Record<string, string>>({})
  const [createJarLabels, setCreateJarLabels] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [labelBatch, setLabelBatch] = useState<Batch | null>(null)
  const [scanPayload, setScanPayload] = useState<ScanPayload | null>(null)
  const [scanError, setScanError] = useState('')
  const [prefilledBatchId, setPrefilledBatchId] = useState<string | undefined>(query.get('batchId') || undefined)
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID())
  const qrRef = useRef<HTMLImageElement>(null)
  const barcodeRef = useRef<SVGSVGElement>(null)

  const refresh = async () => {
    const [batchResponse, activityResponse] = await Promise.all([fetch('/api/batches'), fetch('/api/activities')])
    if (!batchResponse.ok || !activityResponse.ok) throw new Error('Could not load local lab data.')
    setBatches(await batchResponse.json())
    setActivities(await activityResponse.json())
  }

  useEffect(() => {
    refresh().catch((error: Error) => setFeedback({ kind: 'error', text: error.message }))
  }, [])

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
    fetch(`/api/lab-scan?t=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Label not found.')
        setScanPayload(payload)
      })
      .catch((error: Error) => setScanError(error.message))
  }, [])

  const openActivity = (process: string) => {
    setSelectedProcess(process)
    setActivityDateTime(localNow())
    setOperator('')
    setNotes('')
    setJarCount('')
    setDetails({})
    setClientRequestId(crypto.randomUUID())
    setFeedback(null)
  }

  const saveActivity = async () => {
    if (!selectedProcess) return
    if (selectedProcess === 'Autoclave run' && Number(jarCount) < 1) {
      setFeedback({ kind: 'error', text: 'Enter the number of jars before saving an autoclave run.' })
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const response = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processType: selectedProcess, activityDateTime, operator, notes, jarCount: jarCount ? Number(jarCount) : undefined, detailsJson: details, createJarLabels, batchId: prefilledBatchId, clientRequestId }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'The activity could not be saved.')
      await refresh()
      setSelectedProcess(null)
      setFeedback({ kind: 'success', text: payload.batchCode ? `Saved. New batch ${payload.batchCode} created.` : 'Activity saved locally.' })
    } catch (error) {
      setFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'The activity could not be saved.' })
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

  if (window.location.pathname === '/lab-scan') {
    const record = scanPayload?.record
    const batch = scanPayload?.kind === 'jar' ? record?.batch : record
    return <div className="min-h-screen bg-background p-5 text-slate-100"><div className="mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-neon"><p className="text-xs uppercase tracking-[0.3em] text-cyan-400">Cordyceps Lab</p>{scanError ? <><h1 className="mt-5 text-3xl font-semibold text-white">Label not found</h1><p className="mt-3 text-slate-400">This QR or barcode is invalid or no longer registered.</p></> : record && batch ? <><h1 className="mt-5 text-3xl font-semibold text-white">{scanPayload.kind === 'jar' ? record.jarCode : batch.batchCode}</h1><p className="mt-2 text-slate-400">{batch.currentStage} · {batch.currentLocation || 'Location not recorded'}</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><button onClick={() => { window.location.href = `/?batchId=${batch.id}&process=Inoculation` }} className="min-h-14 rounded-xl bg-cyan-400 font-semibold text-slate-950">Inoculation</button><button onClick={() => { window.location.href = `/?batchId=${batch.id}&process=Incubation%20observation` }} className="min-h-14 rounded-xl border border-slate-700 text-white">Incubation observation</button><button onClick={() => { window.location.href = `/?batchId=${batch.id}&process=Dark-room%20to%20light-room%20transfer` }} className="min-h-14 rounded-xl border border-slate-700 text-white">Dark-to-light transfer</button><button onClick={() => { window.location.href = `/?batchId=${batch.id}&process=Harvest` }} className="min-h-14 rounded-xl border border-slate-700 text-white">Harvest</button><button onClick={() => { window.location.href = `/?batchId=${batch.id}&process=Contamination%20observation` }} className="min-h-14 rounded-xl border border-rose-400/40 text-rose-200">Contamination</button></div></> : <p className="mt-6 text-slate-400">Looking up label...</p>}</div></div>
  }

  return (
    <div className="min-h-screen bg-background bg-grid bg-[length:32px_32px] text-slate-100">
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/80 px-5 py-4 shadow-neon">
          <div><p className="text-xs uppercase tracking-[0.36em] text-cyan-400">Cordyceps Lab</p><h1 className="mt-2 text-2xl font-semibold text-white">Cultivation logbook</h1></div>
          <button onClick={() => openActivity('Autoclave run')} className="flex min-h-14 items-center gap-2 rounded-xl bg-cyan-400 px-5 font-semibold text-slate-950"><ClipboardList className="h-5 w-5" /> Add activity</button>
        </header>

        {feedback && <div className={`mb-5 flex items-center gap-3 rounded-xl border px-4 py-3 ${feedback.kind === 'success' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-rose-400/40 bg-rose-400/10 text-rose-200'}`}>{feedback.kind === 'success' ? <Check /> : <X />}{feedback.text}</div>}

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          {stats.map(({ label, value, Icon }) => <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5"><div className="flex items-center justify-between text-slate-400"><span>{label}</span><Icon className="h-5 w-5 text-cyan-400" /></div><div className="mt-2 text-3xl font-semibold text-white">{value}</div></div>)}
        </section>

        <main className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-neon"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">Batches</h2><span className="text-sm text-slate-400">{batches.length} local</span></div>{batches.length === 0 ? <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-400">Save an autoclave run to create the first batch.</p> : <div className="space-y-3">{batches.map((batch) => <div key={batch.id} className="rounded-xl border border-slate-800 bg-slate-950/80 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-cyan-400">{batch.batchCode}</p><p className="mt-1 text-slate-300">{batch.jarCount} jars · {batch.currentLocation || 'No location'}</p></div><span className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300">{batch.currentStage}</span></div><div className="mt-4 flex gap-2"><button onClick={() => setLabelBatch(batch)} className="flex min-h-11 items-center gap-2 rounded-lg border border-cyan-500/30 px-3 text-cyan-200"><QrCode className="h-4 w-4" /> Label</button><a href={`/lab-scan?t=${batch.qrToken}`} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-700 px-3 text-slate-300"><ScanLine className="h-4 w-4" /> Scan</a></div></div>)}</div>}</section>
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-neon"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">Recent activities</h2><FlaskConical className="h-5 w-5 text-cyan-400" /></div><div className="space-y-3">{activities.length === 0 ? <p className="text-slate-400">No saved activities yet.</p> : activities.slice(0, 8).map((activity) => <div key={activity.id} className="rounded-xl border border-slate-800 bg-slate-950/80 p-3"><div className="flex justify-between gap-3"><span className="font-medium text-white">{activity.processType || activity.type}</span><span className="text-xs text-slate-500">{new Date(activity.activityDateTime).toLocaleString('en-IN')}</span></div><p className="mt-1 text-sm text-slate-400">{activity.batch?.batchCode || 'Unassigned'} · {activity.googleSyncStatus}</p></div>)}</div></section>
        </main>
      </div>

      {selectedProcess && <div className="fixed inset-0 z-20 overflow-y-auto bg-slate-950/90 p-4 backdrop-blur-sm"><div className="mx-auto max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-7"><div className="mb-5 flex items-start justify-between"><div><p className="text-xs uppercase tracking-[0.25em] text-cyan-400">Add activity</p><h2 className="mt-2 text-2xl font-semibold text-white">{selectedProcess}</h2></div><button onClick={() => setSelectedProcess(null)} className="rounded-lg p-3 text-slate-400"><X /></button></div><div className="mb-5 grid gap-3 sm:grid-cols-2">{processes.map(([name, subtitle, icon]) => <button key={name} onClick={() => setSelectedProcess(name)} className={`min-h-20 rounded-xl border p-3 text-left ${name === selectedProcess ? 'border-cyan-400 bg-cyan-400/10' : 'border-slate-700 bg-slate-950/60'}`}><span className="mr-2 text-xl">{icon}</span><span className="font-medium text-white">{name}</span><span className="mt-1 block text-xs text-slate-400">{subtitle}</span></button>)}</div><div className="grid gap-4 sm:grid-cols-2"><label className="field">Activity date and time<input type="datetime-local" value={activityDateTime} onChange={(event) => setActivityDateTime(event.target.value)} /></label><label className="field">Operator<input value={operator} onChange={(event) => setOperator(event.target.value)} placeholder="Name" /></label>{selectedProcess !== 'Incubation observation' && <label className="field">Number of jars<input type="number" min="1" inputMode="numeric" value={jarCount} onChange={(event) => setJarCount(event.target.value)} placeholder="0" /></label>}{detailFields.map(([key, label]) => <label className="field" key={key}>{label}<input value={details[key] || ''} onChange={(event) => setDetail(key, event.target.value)} /></label>)}<label className="field sm:col-span-2">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="What happened?" /></label></div>{selectedProcess === 'Autoclave run' && <label className="mt-4 flex items-center gap-3 rounded-xl border border-slate-700 p-4 text-slate-200"><input type="checkbox" checked={createJarLabels} onChange={(event) => setCreateJarLabels(event.target.checked)} className="h-5 w-5" />Create individual QR labels for every jar</label>}<div className="mt-6 flex justify-end gap-3"><button onClick={() => setSelectedProcess(null)} className="min-h-12 rounded-xl border border-slate-700 px-5 text-slate-300">Cancel</button><button disabled={saving} onClick={saveActivity} className="min-h-12 rounded-xl bg-cyan-400 px-6 font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving locally...' : 'Save activity'}</button></div></div></div>}

      {labelBatch && <div className="fixed inset-0 z-30 overflow-y-auto bg-slate-950/90 p-4"><div className="mx-auto max-w-xl rounded-xl bg-white p-8 text-slate-950"><div className="flex justify-end print:hidden"><button onClick={() => setLabelBatch(null)}><X /></button></div><div className="text-center"><p className="text-sm font-semibold uppercase tracking-[0.3em]">Cordyceps Lab</p><h2 className="mt-4 text-4xl font-bold">{labelBatch.batchCode}</h2><img ref={qrRef} alt={`QR code for ${labelBatch.batchCode}`} className="mx-auto my-4 h-48 w-48" /><svg ref={barcodeRef} className="mx-auto max-w-full" /><p className="mt-4 text-sm">Autoclave date: {new Date(labelBatch.createdAt || Date.now()).toLocaleDateString('en-IN')} · {labelBatch.jarCount} jars</p></div><button onClick={() => window.print()} className="print:hidden mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-white"><Printer className="h-5 w-5" /> Print label</button></div></div>}
    </div>
  )
}

export default App
