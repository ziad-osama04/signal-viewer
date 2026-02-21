import { useState, useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import Sidebar from '../components/Sidebar'
import FileUpload from '../components/ui/FileUpload'
import StatCard from '../components/ui/StatCard'

// ── Plotly theme ──────────────────────────────────────────────────────────────
const DARK_LAYOUT = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(13,19,39,0.5)',
    font:   { color: '#7a8bb5', family: 'Inter', size: 11 },
    margin: { t: 20, r: 20, b: 45, l: 60 },
    xaxis:  { gridcolor: 'rgba(99,140,255,0.06)', zerolinecolor: 'rgba(99,140,255,0.1)' },
    yaxis:  { gridcolor: 'rgba(99,140,255,0.06)', zerolinecolor: 'rgba(99,140,255,0.1)' },
}
const PLOT_CFG = { displayModeBar: false, responsive: true }

const BASE = 'http://127.0.0.1:8000/api/bio'

const TAXA_COLORS  = ['#4f8ef7', '#22d3a5', '#f59e0b', '#ef4444', '#a78bfa']
const DIAG_COLORS  = {
    'Healthy':            { bg: 'rgba(52,211,153,0.15)',  text: '#34d399',  border: 'rgba(52,211,153,0.4)'  },
    "Crohn's Disease":    { bg: 'rgba(239,68,68,0.15)',   text: '#ef4444',  border: 'rgba(239,68,68,0.4)'   },
    'Ulcerative Colitis': { bg: 'rgba(251,191,36,0.15)',  text: '#fbbf24',  border: 'rgba(251,191,36,0.4)'  },
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function DiagBadge({ diagnosis }) {
    const c = DIAG_COLORS[diagnosis] || { bg: 'rgba(100,100,100,0.2)', text: '#aaa', border: 'rgba(100,100,100,0.3)' }
    return (
        <span className="inline-block px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
            {diagnosis}
        </span>
    )
}

function StatRow({ label, value, valueStyle }) {
    return (
        <div className="flex justify-between py-1.5 border-b border-white/5 text-xs last:border-0">
            <span className="text-[#7a8bb5]">{label}</span>
            <span className="text-white font-semibold" style={valueStyle}>{value}</span>
        </div>
    )
}

function ConfidenceBar({ value }) {
    const pct = Math.round(value)
    const color = pct >= 75 ? '#34d399' : pct >= 50 ? '#fbbf24' : '#ef4444'
    return (
        <div>
            <div className="flex justify-between text-xs mb-1">
                <span className="text-[#7a8bb5]">Confidence</span>
                <span className="font-bold" style={{ color }}>{pct}%</span>
            </div>
            <div className="w-full bg-[rgba(99,140,255,0.1)] rounded-full h-1.5">
                <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
            </div>
        </div>
    )
}

function Spinner() {
    return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-[3px] border-[rgba(99,140,255,0.2)] border-t-[#638cff] rounded-full animate-spin" />
            <p className="text-[#7a8bb5] text-sm">Analyzing microbiome signals…</p>
        </div>
    )
}

// ── Per-patient card with charts ──────────────────────────────────────────────
function PatientCard({ patient, index }) {
    const timelineRef = useRef(null)
    const probRef     = useRef(null)
    const c = DIAG_COLORS[patient.diagnosis] || {}

    // Timeline chart — top 5 taxa over weeks
    useEffect(() => {
        if (!timelineRef.current || !patient.weekly_data?.weeks?.length) return
        const { weeks, taxa, values } = patient.weekly_data
        const traces = taxa.map((taxon, i) => ({
            x:    weeks,
            y:    values[i],
            mode: 'lines+markers',
            name: taxon,
            line: { color: TAXA_COLORS[i], width: 2 },
            marker: { size: 4 },
        }))
        Plotly.react(timelineRef.current, traces, {
            ...DARK_LAYOUT,
            height: 220,
            showlegend: true,
            legend: { font: { size: 9, color: '#7a8bb5' }, bgcolor: 'transparent', orientation: 'h', y: -0.3 },
            xaxis: { ...DARK_LAYOUT.xaxis, title: { text: 'Week', font: { size: 10 } } },
            yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'Abundance', font: { size: 10 } } },
        }, PLOT_CFG)
    }, [patient])

    // Probability bar chart
    useEffect(() => {
        if (!probRef.current) return
        const labels = Object.keys(patient.probabilities)
        const values = labels.map(k => patient.probabilities[k] * 100)
        const colors = labels.map(l => DIAG_COLORS[l]?.text || '#638cff')
        const isPred = labels.map(l => l === patient.diagnosis)

        Plotly.react(probRef.current, [{
            x: labels,
            y: values,
            type:   'bar',
            marker: {
                color:     colors.map((c, i) => isPred[i] ? c : c + '55'),
                line:      { color: colors, width: isPred.map(p => p ? 2 : 0.5) },
            },
            text:  values.map(v => `${v.toFixed(1)}%`),
            textposition: 'outside',
            textfont: { size: 10, color: '#7a8bb5' },
        }], {
            ...DARK_LAYOUT,
            height: 180,
            margin: { ...DARK_LAYOUT.margin, t: 10, b: 60 },
            yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'Probability (%)', font: { size: 10 } }, range: [0, 115] },
            xaxis: { ...DARK_LAYOUT.xaxis, tickfont: { size: 9 } },
        }, PLOT_CFG)
    }, [patient])

    return (
        <div className="rounded-xl border p-5 mb-5"
            style={{ background: 'linear-gradient(135deg, rgba(20,28,58,0.8), rgba(15,22,48,0.9))', borderColor: c.border || 'rgba(99,140,255,0.15)' }}>

            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <span className="text-[#638cff] font-bold text-sm">🧬 {patient.participant_id}</span>
                        <span className="text-[#7a8bb5] text-xs">{patient.num_weeks} weeks analyzed</span>
                    </div>
                    <DiagBadge diagnosis={patient.diagnosis} />
                </div>
                <ConfidenceBar value={patient.confidence} />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <p className="text-[10px] text-[#7a8bb5] uppercase tracking-widest mb-1">Top Taxa Over Time</p>
                    <div className="bg-[rgba(13,19,39,0.5)] rounded-lg border border-[rgba(99,140,255,0.08)] p-2">
                        <div ref={timelineRef} />
                    </div>
                </div>
                <div>
                    <p className="text-[10px] text-[#7a8bb5] uppercase tracking-widest mb-1">Diagnosis Probabilities</p>
                    <div className="bg-[rgba(13,19,39,0.5)] rounded-lg border border-[rgba(99,140,255,0.08)] p-2">
                        <div ref={probRef} />
                    </div>
                </div>
            </div>

            {/* Top taxa table */}
            {patient.top_taxa?.length > 0 && (
                <div>
                    <p className="text-[10px] text-[#7a8bb5] uppercase tracking-widest mb-2">Top Contributing Taxa</p>
                    <div className="space-y-1">
                        {patient.top_taxa.map((t, i) => (
                            <div key={t.name} className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TAXA_COLORS[i] }} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between text-xs mb-0.5">
                                        <span className="text-gray-300 truncate">{t.name}</span>
                                        <span className="text-[#7a8bb5] ml-2 flex-shrink-0">{t.mean_abundance.toFixed(2)}</span>
                                    </div>
                                    <div className="w-full bg-[rgba(99,140,255,0.08)] rounded-full h-1">
                                        <div className="h-1 rounded-full" style={{
                                            width: `${Math.min(100, (t.mean_abundance / (patient.top_taxa[0]?.mean_abundance || 1)) * 100)}%`,
                                            background: TAXA_COLORS[i]
                                        }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Microbiome() {
    const [loading,  setLoading]  = useState(false)
    const [result,   setResult]   = useState(null)   // { patients: [...] }
    const [error,    setError]    = useState(null)
    const [selected, setSelected] = useState(null)   // selected patient index for summary

    const upload = async (file) => {
        if (!file) return
        setLoading(true)
        setResult(null)
        setError(null)
        setSelected(null)

        const form = new FormData()
        form.append('file', file)

        try {
            const res  = await fetch(`${BASE}/analyze`, { method: 'POST', body: form })
            const data = await res.json()
            if (data.error) throw new Error(data.details || data.error)
            setResult(data)
            if (data.patients?.length > 0) setSelected(0)
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    const patients = result?.patients || []
    const sel      = selected !== null ? patients[selected] : null

    // ── Sidebar ───────────────────────────────────────────────────────────────
    const sidebarContent = (
        <div className="space-y-4">
            <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">🧬 Upload Patient CSV</h3>
                <p className="text-xs text-[#7a8bb5] mb-3">
                    Upload a CSV with columns: <span className="font-mono text-[#638cff]">External ID, Participant ID, week_num, fecalcal</span> + microbiome abundance columns.
                </p>
                <FileUpload accept=".csv" label="Drop .csv file" onFile={upload} />
                {loading && <p className="text-xs text-[#638cff] mt-2 animate-pulse">Processing…</p>}
                {error   && <p className="text-xs text-red-400 mt-2">❌ {error}</p>}
            </section>

            {/* Patient list */}
            {patients.length > 0 && (
                <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Patients ({patients.length})</h3>
                    <div className="space-y-1.5">
                        {patients.map((p, i) => {
                            const c = DIAG_COLORS[p.diagnosis] || {}
                            return (
                                <button
                                    key={p.participant_id}
                                    onClick={() => setSelected(i)}
                                    className="w-full text-left rounded-lg px-3 py-2 text-xs transition-all border"
                                    style={{
                                        background:   selected === i ? c.bg || 'rgba(99,140,255,0.1)' : 'transparent',
                                        borderColor:  selected === i ? c.border || 'rgba(99,140,255,0.3)' : 'transparent',
                                        color: '#cbd5e1',
                                    }}
                                >
                                    <div className="font-semibold">{p.participant_id}</div>
                                    <div className="flex items-center justify-between mt-0.5">
                                        <span style={{ color: c.text || '#638cff' }}>{p.diagnosis}</span>
                                        <span className="text-[#7a8bb5]">{Math.round(p.confidence)}%</span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </section>
            )}

            {/* Selected patient summary */}
            {sel && (
                <StatCard title="📋 Summary">
                    <StatRow label="Patient"   value={sel.participant_id} />
                    <StatRow label="Weeks"     value={sel.num_weeks} />
                    <StatRow label="Diagnosis" value={sel.diagnosis} valueStyle={{ color: DIAG_COLORS[sel.diagnosis]?.text }} />
                    <StatRow label="Confidence" value={`${Math.round(sel.confidence)}%`} />
                    <div className="mt-2 space-y-0.5">
                        {Object.entries(sel.probabilities).map(([label, prob]) => (
                            <div key={label} className="flex justify-between text-[10px]">
                                <span className="text-[#7a8bb5] truncate">{label}</span>
                                <span style={{ color: DIAG_COLORS[label]?.text || '#aaa' }}>{(prob * 100).toFixed(1)}%</span>
                            </div>
                        ))}
                    </div>
                </StatCard>
            )}
        </div>
    )

    return (
        <div className="flex min-h-screen bg-dark-bg">
            <Sidebar>{sidebarContent}</Sidebar>
            <main className="ml-[260px] flex-1 p-6 overflow-y-auto min-h-screen">
                <h1 className="text-2xl font-bold text-white mb-1">🧬 Microbiome Signal Viewer</h1>
                <p className="text-sm text-gray-400 mb-6">
                    IBD disease classification from longitudinal microbiome data — GRU sequence model
                </p>

                {/* Empty state */}
                {!loading && !result && !error && (
                    <div className="flex flex-col items-center justify-center py-28 text-center text-[#4a5580]">
                        <div className="text-6xl mb-4 opacity-40">🦠</div>
                        <h3 className="text-[#7a8bb5] font-semibold text-lg mb-2">No Data Loaded</h3>
                        <p className="text-sm max-w-sm">
                            Upload a patient CSV file (same format as <span className="font-mono text-[#638cff]">blind_test.csv</span>) to run IBD diagnosis
                        </p>
                    </div>
                )}

                {/* Loading */}
                {loading && <Spinner />}

                {/* Error */}
                {error && !loading && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
                        <p className="text-red-400 font-semibold mb-1">Analysis Failed</p>
                        <p className="text-red-300 text-sm">{error}</p>
                    </div>
                )}

                {/* Results — all patients */}
                {!loading && patients.length > 0 && (
                    <>
                        {/* Summary row */}
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            {Object.entries(
                                patients.reduce((acc, p) => {
                                    acc[p.diagnosis] = (acc[p.diagnosis] || 0) + 1
                                    return acc
                                }, {})
                            ).map(([diag, count]) => {
                                const c = DIAG_COLORS[diag] || {}
                                return (
                                    <div key={diag} className="rounded-xl border p-4 text-center"
                                        style={{ background: c.bg, borderColor: c.border }}>
                                        <p className="text-2xl font-bold" style={{ color: c.text }}>{count}</p>
                                        <p className="text-xs text-[#7a8bb5] mt-1">{diag}</p>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Per-patient cards */}
                        {patients.map((p, i) => (
                            <PatientCard key={p.participant_id} patient={p} index={i} />
                        ))}
                    </>
                )}
            </main>
        </div>
    )
}
