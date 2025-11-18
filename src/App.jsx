import { useEffect, useRef, useState } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

function StatCard({ label, value }) {
  return (
    <div className="bg-slate-800/60 border border-blue-500/20 rounded-xl p-4">
      <p className="text-blue-300/80 text-sm">{label}</p>
      <p className="text-2xl font-semibold text-white mt-1">{value}</p>
    </div>
  )
}

function Badge({ children }) {
  return <span className="px-2 py-0.5 rounded bg-slate-900/60 border border-slate-700 text-blue-200/90">{children}</span>
}

function App() {
  const [loading, setLoading] = useState(false)
  const [seeded, setSeeded] = useState(false)
  const [logs, setLogs] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [statusMsg, setStatusMsg] = useState('')

  // Agentic state
  const [agentConfig, setAgentConfig] = useState(null)
  const [agentStatus, setAgentStatus] = useState(null)
  const [gmailQueue, setGmailQueue] = useState([])
  const [autoRun, setAutoRun] = useState(false)
  const intervalRef = useRef(null)

  const [form, setForm] = useState({
    from_email: 'vendor@example.com',
    subject: 'What is the status of VR-2025-0012?',
    body: 'Hi team, could you confirm the status of my vendor registration VR-2025-0012? Thanks.'
  })

  useEffect(() => {
    refreshAll()
    loadAgentMeta()
    pollGmail()
  }, [])

  useEffect(() => {
    if (autoRun) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = setInterval(async () => {
        await runOnce(false)
        await pollGmail()
        await refreshAll()
        await loadAgentStatus()
      }, 3000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [autoRun])

  const api = async (path, opts = {}) => {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return res.json()
  }

  const refreshAll = async () => {
    try {
      setLoading(true)
      const [an, ls] = await Promise.all([
        api('/analytics/summary').catch(() => null),
        api('/logs').catch(() => [])
      ])
      if (an) setAnalytics(an)
      if (ls) setLogs(ls)
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const loadAgentMeta = async () => {
    try {
      const [cfg, st] = await Promise.all([
        api('/agent/config').catch(() => null),
        api('/agent/status').catch(() => null),
      ])
      if (cfg) setAgentConfig(cfg)
      if (st) setAgentStatus(st)
    } catch (e) {
      // ignore
    }
  }

  const loadAgentStatus = async () => {
    try {
      const st = await api('/agent/status')
      setAgentStatus(st)
    } catch (e) {
      // ignore
    }
  }

  const pollGmail = async () => {
    try {
      const res = await api('/gmail/poll')
      setGmailQueue(res.items || [])
    } catch (e) {
      setGmailQueue([])
    }
  }

  const handleSeed = async () => {
    setStatusMsg('Seeding sample vendor requests...')
    try {
      await api('/seed/vendors', { method: 'POST', body: JSON.stringify([]) })
      setSeeded(true)
      setStatusMsg('Seeded sample vendor requests.')
      await refreshAll()
      await loadAgentStatus()
    } catch (e) {
      setStatusMsg(`Failed to seed: ${e.message}`)
    }
  }

  const handleIngest = async () => {
    setStatusMsg('Ingesting mock email...')
    try {
      await api('/ingest/mock-email', { method: 'POST', body: JSON.stringify(form) })
      setStatusMsg('Email ingested. You can now Process Next.')
      await refreshAll()
      await pollGmail()
      await loadAgentStatus()
    } catch (e) {
      setStatusMsg(`Failed to ingest: ${e.message}`)
    }
  }

  const handleProcess = async () => {
    await runOnce(true)
  }

  const runOnce = async (showMsg = true) => {
    if (showMsg) setStatusMsg('Processing next email...')
    try {
      const res = await api('/agent/run-once', { method: 'POST' })
      if (res.processed) setStatusMsg('Processed one email and replied (mock).')
      else setStatusMsg('No emails pending.')
      await refreshAll()
      await pollGmail()
      await loadAgentStatus()
    } catch (e) {
      setStatusMsg(`Process failed: ${e.message}`)
    }
  }

  const runLoop = async (steps = 10) => {
    setStatusMsg(`Running loop for up to ${steps} steps...`)
    try {
      const res = await api('/agent/run-loop', { method: 'POST', body: JSON.stringify({ max_steps: steps }) })
      setStatusMsg(`Loop done. Processed ${res.processed} messages.`)
      await refreshAll()
      await pollGmail()
      await loadAgentStatus()
    } catch (e) {
      setStatusMsg(`Run-loop failed: ${e.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Vendor Master Email POC</h1>
            <p className="text-blue-300/80 text-sm mt-1">Backend: {BACKEND_URL}</p>
          </div>
          <a href="/test" className="text-blue-300 hover:text-white underline/30">Env test</a>
        </header>

        {/* Agentic Controls */}
        <div className="bg-slate-800/60 border border-blue-500/20 rounded-2xl p-6 mb-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="font-semibold text-lg">Agent</h3>
              <p className="text-blue-200/80 text-sm">Fully agentic run-loop with mock Gmail and mock Gemini, switchable later.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge>Gmail mode: {agentConfig?.gmail_mode || 'mock'}</Badge>
                <Badge>Gemini mode: {agentConfig?.gemini_mode || 'mock'}</Badge>
                <Badge>Pending: {agentStatus?.pending ?? 0}</Badge>
                <Badge>In-Process: {agentStatus?.in_process ?? 0}</Badge>
                <Badge>Responded: {agentStatus?.responded ?? 0}</Badge>
                <Badge>Escalated: {agentStatus?.escalated ?? 0}</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => runOnce(true)} className="bg-emerald-600 hover:bg-emerald-500 rounded-lg px-4 py-2 font-semibold">Run Once</button>
              <button onClick={() => runLoop(10)} className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-4 py-2 font-semibold">Run 10 steps</button>
              {!autoRun ? (
                <button onClick={() => setAutoRun(true)} className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 font-semibold">Start Auto</button>
              ) : (
                <button onClick={() => setAutoRun(false)} className="bg-red-600 hover:bg-red-500 rounded-lg px-4 py-2 font-semibold">Stop Auto</button>
              )}
            </div>
          </div>
          {/* Gmail Queue */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold">Queue (label: VM-QUERIES)</h4>
              <button onClick={pollGmail} className="text-sm text-blue-300 hover:text-white">Refresh</button>
            </div>
            {gmailQueue.length === 0 ? (
              <p className="text-blue-300/80 text-sm">Empty queue.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-blue-300/80">
                    <tr>
                      <th className="py-2 pr-4">From</th>
                      <th className="py-2 pr-4">Subject</th>
                      <th className="py-2 pr-4">Snippet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gmailQueue.map((m) => (
                      <tr key={m.messageId || m.threadId} className="border-t border-slate-700/40">
                        <td className="py-2 pr-4 text-blue-100">{m.from}</td>
                        <td className="py-2 pr-4 text-blue-100">{m.subject}</td>
                        <td className="py-2 pr-4 text-blue-100/80">{m.snippet}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Manual Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-slate-800/50 border border-blue-500/20 rounded-2xl p-6">
            <h3 className="font-semibold text-lg mb-3">1) Seed Sample Data</h3>
            <p className="text-blue-200/80 text-sm mb-4">Preload a few Vendor Requests for deterministic responses.</p>
            <button onClick={handleSeed} className="w-full bg-blue-600 hover:bg-blue-500 rounded-lg py-2 font-semibold">Seed</button>
            {seeded && <p className="text-green-300 text-sm mt-2">Seeded</p>}
          </div>

          <div className="bg-slate-800/50 border border-blue-500/20 rounded-2xl p-6">
            <h3 className="font-semibold text-lg mb-3">2) Ingest Mock Email</h3>
            <div className="space-y-3">
              <input className="w-full bg-slate-900/60 border border-slate-700 rounded px-3 py-2 text-sm" placeholder="from" value={form.from_email} onChange={e=>setForm({...form, from_email:e.target.value})} />
              <input className="w-full bg-slate-900/60 border border-slate-700 rounded px-3 py-2 text-sm" placeholder="subject" value={form.subject} onChange={e=>setForm({...form, subject:e.target.value})} />
              <textarea rows={4} className="w-full bg-slate-900/60 border border-slate-700 rounded px-3 py-2 text-sm" placeholder="body" value={form.body} onChange={e=>setForm({...form, body:e.target.value})} />
              <button onClick={handleIngest} className="w-full bg-blue-600 hover:bg-blue-500 rounded-lg py-2 font-semibold">Ingest</button>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-blue-500/20 rounded-2xl p-6 flex flex-col">
            <h3 className="font-semibold text-lg mb-3">3) Process & Reply</h3>
            <p className="text-blue-200/80 text-sm mb-4">Runs the agent logic, decides response, and updates labels.</p>
            <button onClick={handleProcess} className="w-full bg-emerald-600 hover:bg-emerald-500 rounded-lg py-2 font-semibold">Process Next</button>
            <p className="text-blue-200/80 text-sm mt-4 min-h-[24px]">{statusMsg}</p>
          </div>
        </div>

        {/* Analytics */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
          <StatCard label="Total" value={analytics?.total ?? 0} />
          <StatCard label="Auto-resolved" value={analytics?.auto_resolved ?? 0} />
          <StatCard label="Info requests" value={analytics?.info_request ?? 0} />
          <StatCard label="Escalated" value={analytics?.escalated ?? 0} />
          <StatCard label="Status" value={analytics?.by_intent?.status ?? 0} />
          <StatCard label="Docs" value={analytics?.by_intent?.docs ?? 0} />
        </div>

        {/* Logs */}
        <div className="bg-slate-800/50 border border-blue-500/20 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">Recent Threads</h3>
            <button onClick={refreshAll} className="text-sm text-blue-300 hover:text-white">Refresh</button>
          </div>
          {loading ? (
            <p className="text-blue-300">Loading...</p>
          ) : logs.length === 0 ? (
            <p className="text-blue-300/80">No interactions yet. Seed, ingest an email, then process.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-blue-300/80">
                  <tr>
                    <th className="py-2 pr-4">From</th>
                    <th className="py-2 pr-4">Subject</th>
                    <th className="py-2 pr-4">Intent</th>
                    <th className="py-2 pr-4">Outcome</th>
                    <th className="py-2 pr-4">Labels</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l._id} className="border-t border-slate-700/40">
                      <td className="py-2 pr-4 text-blue-100">{l.from_email}</td>
                      <td className="py-2 pr-4 text-blue-100">{l.subject}</td>
                      <td className="py-2 pr-4">{l.intent || '-'}{l.entities?.request_id ? ` (${l.entities.request_id})` : ''}</td>
                      <td className="py-2 pr-4">{l.resolution_type || '-'}</td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {(l.labels || []).map((lb) => (
                            <span key={lb} className="px-2 py-0.5 rounded bg-slate-900/60 border border-slate-700 text-blue-200/90">{lb}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="text-center text-blue-300/70 text-xs mt-8">
          Fully agentic label-based polling • Toggle mock/live Gmail & Gemini when ready
        </footer>
      </div>
    </div>
  )
}

export default App
