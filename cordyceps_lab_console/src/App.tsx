import { motion } from 'framer-motion'
import { Activity, AlertTriangle, FlaskConical, MoonStar, MoveRight, Plus, Minus, SunMedium, TimerReset, ArrowRightLeft } from 'lucide-react'
import { useMemo, useState } from 'react'

const batchData = [
  { id: 'CM-104', strain: 'Strain A', stage: 'Dark Room', progress: 62, jars: 28 },
  { id: 'CM-105', strain: 'Strain B', stage: 'Light Room', progress: 74, jars: 21 },
  { id: 'CM-106', strain: 'Strain C', stage: 'Inoculated', progress: 33, jars: 16 },
  { id: 'CM-107', strain: 'Strain D', stage: 'Contaminated', progress: 12, jars: 4 },
]

const activityFeed = [
  { time: '09:10', action: 'Autoclave cycle complete', detail: 'Cycle #18 • 42 min' },
  { time: '08:40', action: 'Dark room shift', detail: '12 jars moved to fruiting' },
  { time: '07:55', action: 'Inoculation batch', detail: '24 jars inoculated' },
  { time: '07:10', action: 'Contamination alert', detail: '3 jars flagged • Follow-up required' },
]

const stageCounts = [
  { label: 'Prep', value: 18 },
  { label: 'Autoclaved', value: 32 },
  { label: 'Inoculated', value: 56 },
  { label: 'Dark', value: 115 },
  { label: 'Light', value: 76 },
  { label: 'Harvested', value: 22 },
  { label: 'Contaminated', value: 8 },
]

function App() {
  const [contaminatedCount, setContaminatedCount] = useState(0)
  const [autoclaveMinutes, setAutoclaveMinutes] = useState(45)
  const [darkRoomShift, setDarkRoomShift] = useState(12)
  const [lightRoomShift, setLightRoomShift] = useState(8)

  const totals = useMemo(() => {
    const totalJars = batchData.reduce((sum, item) => sum + item.jars, 0)
    const activeBatches = batchData.length
    return { totalJars, activeBatches }
  }, [])

  return (
    <div className="min-h-screen bg-background bg-grid bg-[length:32px_32px] text-slate-100">
      <div className="mx-auto max-w-7xl p-6">
        <header className="mb-8 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 px-5 py-4 shadow-neon backdrop-blur-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.36em] text-cyan-400">Cordyceps Lab</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Futuristic Lab Console</h1>
          </div>
          <div className="flex items-center gap-3 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200">
            <Activity className="h-4 w-4" />
            System stable
          </div>
        </header>

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          {[
            { label: 'Total jars', value: totals.totalJars, icon: FlaskConical, tone: 'cyan' },
            { label: 'Active batches', value: totals.activeBatches, icon: MoonStar, tone: 'violet' },
            { label: 'Dark room', value: 115, icon: MoonStar, tone: 'blue' },
            { label: 'Light room', value: 76, icon: SunMedium, tone: 'amber' },
          ].map((item) => (
            <motion.div
              key={item.label}
              whileHover={{ y: -3 }}
              className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-neon"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{item.label}</span>
                <item.icon className={`h-5 w-5 text-${item.tone}-400`} />
              </div>
              <div className="text-3xl font-bold text-white">{item.value}</div>
            </motion.div>
          ))}
        </section>

        <main className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-neon">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Current batches</h2>
                <button className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-sm text-cyan-200">
                  + New batch
                </button>
              </div>

              <div className="space-y-4">
                {batchData.map((batch) => (
                  <div key={batch.id} className="rounded-xl border border-slate-800 bg-[#0a1120] p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{batch.id}</p>
                        <h3 className="text-lg font-semibold text-white">{batch.strain}</h3>
                      </div>
                      <div className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300">
                        {batch.stage}
                      </div>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-sm text-slate-400">
                      <span>{batch.jars} jars</span>
                      <span>{batch.progress}% progress</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${batch.progress}%` }}
                        transition={{ duration: 0.6 }}
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-emerald-400"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-neon">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Stage summary</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {stageCounts.map((stage) => (
                  <div key={stage.label} className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{stage.label}</div>
                    <div className="mt-2 text-2xl font-semibold text-cyan-300">{stage.value}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-neon">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Quick entry pad</h2>
                <TimerReset className="h-4 w-4 text-cyan-400" />
              </div>

              <div className="space-y-5">
                <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
                  <div className="mb-3 flex items-center justify-between text-sm text-orange-200">
                    <span>Contaminated jars</span>
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() => setContaminatedCount((count) => Math.max(0, count - 1))}
                      className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-xl text-white"
                    >
                      <Minus className="h-5 w-5" />
                    </button>
                    <div className="text-4xl font-bold text-orange-300">{contaminatedCount}</div>
                    <button
                      onClick={() => setContaminatedCount((count) => count + 1)}
                      className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-xl text-white"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                  <div className="mb-3 flex items-center justify-between text-sm text-cyan-200">
                    <span>Autoclave cycle</span>
                    <TimerReset className="h-4 w-4" />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() => setAutoclaveMinutes((value) => Math.max(15, value - 5))}
                      className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-xl text-white"
                    >
                      <Minus className="h-5 w-5" />
                    </button>
                    <div className="text-center">
                      <div className="text-4xl font-bold text-cyan-300">{autoclaveMinutes}</div>
                      <div className="text-xs uppercase tracking-[0.25em] text-slate-400">min</div>
                    </div>
                    <button
                      onClick={() => setAutoclaveMinutes((value) => value + 5)}
                      className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-xl text-white"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                  <button className="mt-4 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 px-4 py-3 font-medium text-slate-950">
                    Trigger cycle
                  </button>
                </div>

                <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
                  <div className="mb-3 flex items-center justify-between text-sm text-violet-200">
                    <span>Phase shift</span>
                    <ArrowRightLeft className="h-4 w-4" />
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
                        <span>Dark room → Light</span>
                        <span>{darkRoomShift} jars</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setDarkRoomShift((count) => Math.max(0, count - 1))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-950"><Minus className="h-4 w-4" /></button>
                        <input className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-center text-sm text-white outline-none" value={darkRoomShift} readOnly />
                        <button onClick={() => setDarkRoomShift((count) => count + 1)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-950"><Plus className="h-4 w-4" /></button>
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
                        <span>Light room → Dark</span>
                        <span>{lightRoomShift} jars</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setLightRoomShift((count) => Math.max(0, count - 1))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-950"><Minus className="h-4 w-4" /></button>
                        <input className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-center text-sm text-white outline-none" value={lightRoomShift} readOnly />
                        <button onClick={() => setLightRoomShift((count) => count + 1)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-950"><Plus className="h-4 w-4" /></button>
                      </div>
                    </div>

                    <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-3 text-violet-100">
                      Apply shift <MoveRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-neon">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Activity feed</h2>
                <span className="text-xs uppercase tracking-[0.25em] text-slate-400">Live</span>
              </div>

              <div className="space-y-3">
                {activityFeed.map((event) => (
                  <div key={`${event.time}-${event.action}`} className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{event.action}</span>
                      <span className="text-xs text-slate-400">{event.time}</span>
                    </div>
                    <div className="text-sm text-slate-300">{event.detail}</div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </main>
      </div>
    </div>
  )
}

export default App
