import { useState, useEffect, useRef, useCallback } from 'react'
import Plotly from 'plotly.js-dist-min'
import Sidebar from '../components/Sidebar'
import ToggleTabs from '../components/ui/ToggleTabs'
import SliderControl from '../components/ui/SliderControl'
import FileUpload from '../components/ui/FileUpload'
import StatCard from '../components/ui/StatCard'

// ─── Plotly dark theme ────────────────────────────────────────────────────────
const PLOT_LAYOUT = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(13,19,39,0.5)',
    font:   { color: '#7a8bb5', family: 'Inter', size: 11 },
    margin: { t: 10, b: 40, l: 55, r: 20 },
    xaxis:  { gridcolor: 'rgba(99,140,255,0.06)', zerolinecolor: 'rgba(99,140,255,0.1)' },
    yaxis:  { gridcolor: 'rgba(99,140,255,0.06)', zerolinecolor: 'rgba(99,140,255,0.1)' },
}
const PLOT_CFG = { displayModeBar: false, responsive: true }

const BASE = 'http://127.0.0.1:8000/api/acoustic'

// ─── Shared helpers ───────────────────────────────────────────────────────────
function StatRow({ label, value, valueStyle }) {
    return (
        <div className="flex justify-between py-1.5 border-b border-white/5 text-xs last:border-0">
            <span className="text-[#7a8bb5]">{label}</span>
            <span className="text-white font-semibold" style={valueStyle}>{value}</span>
        </div>
    )
}

function Badge({ label, conf }) {
    const cls = conf >= 0.6
        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
        : conf >= 0.4
        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
        : 'bg-red-500/15 text-red-400 border border-red-500/30'
    return (
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${cls}`}>
            {label}
        </span>
    )
}

function ChartBox({ title, children, height = 'h-[220px]' }) {
    return (
        <div className="bg-[rgba(13,19,39,0.5)] border border-[rgba(99,140,255,0.08)] rounded-xl p-3 mb-4">
            {title && <p className="text-[11px] text-[#7a8bb5] uppercase tracking-widest mb-2">{title}</p>}
            <div className={height}>{children}</div>
        </div>
    )
}

function EmptyState({ icon, title, desc }) {
    return (
        <div className="flex flex-col items-center justify-center h-full py-20 text-center text-[#4a5580]">
            <div className="text-5xl mb-4 opacity-60">{icon}</div>
            <h3 className="text-[#7a8bb5] font-semibold text-base mb-2">{title}</h3>
            <p className="text-sm max-w-xs">{desc}</p>
        </div>
    )
}

function Spinner({ active }) {
    if (!active) return null
    return (
        <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-[3px] border-[rgba(99,140,255,0.2)] border-t-[#638cff] rounded-full animate-spin" />
        </div>
    )
}

function PrimaryBtn({ onClick, disabled, loading, children, className = '' }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled || loading}
            className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all
                bg-gradient-to-r from-[#638cff] to-[#4a6cf7] text-white
                shadow-[0_4px_15px_rgba(99,140,255,0.3)]
                hover:shadow-[0_6px_20px_rgba(99,140,255,0.4)] hover:-translate-y-px
                disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                ${className}`}
        >
            {loading ? 'Processing…' : children}
        </button>
    )
}

// ─── WAV generator for audio playback ────────────────────────────────────────
function buildWavUrl(signal, sr) {
    const n = signal.length
    const buf = new ArrayBuffer(44 + n * 2)
    const v = new DataView(buf)
    const ws = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
    ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true)
    ws(8, 'WAVE'); ws(12, 'fmt ')
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true)
    v.setUint16(32, 2, true); v.setUint16(34, 16, true)
    ws(36, 'data'); v.setUint32(40, n * 2, true)
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, signal[i])) * 0x7FFF, true)
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — DOPPLER SIMULATOR
// ═══════════════════════════════════════════════════════════════════════════════
function DopplerSimulator() {
    const [freq, setFreq]         = useState(440)
    const [vel, setVel]           = useState(80)
    const [loading, setLoading]   = useState(false)
    const [result, setResult]     = useState(null)
    const [audioUrl, setAudioUrl] = useState(null)

    const waveRef  = useRef(null)
    const freqRef  = useRef(null)

    const run = async () => {
        setLoading(true)
        setResult(null)
        try {
            const res  = await fetch(`${BASE}/simulate`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ frequency: freq, velocity: vel }),
            })
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            setResult(data)
            if (data.signal && data.sr) setAudioUrl(buildWavUrl(data.signal, data.sr))
        } catch (e) { alert('Simulation failed: ' + e.message) }
        finally     { setLoading(false) }
    }

    // Render charts when result arrives
    useEffect(() => {
        if (!result) return
        if (waveRef.current) {
            Plotly.react(waveRef.current, [{
                x: result.time, y: result.waveform,
                mode: 'lines', line: { color: '#638cff', width: 1.2 }, name: 'Amplitude',
            }], { ...PLOT_LAYOUT, xaxis: { ...PLOT_LAYOUT.xaxis, title: 'Time (s)' }, yaxis: { ...PLOT_LAYOUT.yaxis, title: 'Amplitude' } }, PLOT_CFG)
        }
        if (freqRef.current) {
            Plotly.react(freqRef.current, [
                { x: result.time_freq, y: result.freq_over_time, mode: 'lines', line: { color: '#34d399', width: 2 }, name: 'Observed Freq' },
                { x: [result.time_freq[0], result.time_freq[result.time_freq.length - 1]], y: [freq, freq],
                  mode: 'lines', line: { color: '#fbbf24', width: 1.5, dash: 'dash' }, name: 'Source Freq' },
            ], {
                ...PLOT_LAYOUT, showlegend: true, legend: { x: 0.6, y: 0.95, font: { size: 10 } },
                xaxis: { ...PLOT_LAYOUT.xaxis, title: 'Time (s)' }, yaxis: { ...PLOT_LAYOUT.yaxis, title: 'Frequency (Hz)' },
            }, PLOT_CFG)
        }
    }, [result])

    const sidebar = (
        <div className="space-y-4">
            <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">⚙ Parameters</h3>
                <SliderControl label="Horn Frequency" min={100} max={2000} step={10} value={freq} onChange={setFreq} unit=" Hz" />
                <SliderControl label="Vehicle Speed"  min={10}  max={200}  step={5}  value={vel}  onChange={setVel}  unit=" km/h" />
                <PrimaryBtn onClick={run} loading={loading} className="mt-3">Generate Doppler Sound</PrimaryBtn>
            </section>

            {result?.params && (
                <StatCard title="📋 Parameters">
                    <StatRow label="Source Freq"  value={`${result.params.frequency || freq} Hz`} />
                    <StatRow label="Vehicle Speed" value={`${vel} km/h`} />
                    <StatRow label="Speed (m/s)"  value={result.params.v_car_ms} />
                    <StatRow label="Duration"     value={`${result.params.duration}s`} />
                    <StatRow label="Sample Rate"  value={`${result.params.sr} Hz`} />
                </StatCard>
            )}
        </div>
    )

    return { sidebar, main: (
        <div>
            <Spinner active={loading} />
            {!result && !loading && (
                <EmptyState icon="🎵" title="Doppler Effect Simulator"
                    desc="Adjust frequency and velocity, then click Generate to hear and visualize the Doppler effect" />
            )}
            {result && (
                <>
                    <ChartBox title="Waveform — Simulated Car Pass" height="h-[220px]">
                        <div ref={waveRef} className="h-full" />
                    </ChartBox>
                    <ChartBox title="Observed Frequency Over Time" height="h-[220px]">
                        <div ref={freqRef} className="h-full" />
                    </ChartBox>
                    {audioUrl && (
                        <div className="text-center mt-2">
                            <audio controls className="w-full" style={{ filter: 'hue-rotate(190deg)' }}>
                                <source src={audioUrl} type="audio/wav" />
                            </audio>
                        </div>
                    )}
                </>
            )}
        </div>
    )}
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — DOPPLER ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════
function DopplerAnalysis() {
    const [datasets, setDatasets]     = useState([])
    const [selected, setSelected]     = useState('')
    const [loading, setLoading]       = useState(false)
    const [result, setResult]         = useState(null)

    const waveRef   = useRef(null)
    const fftRef    = useRef(null)
    const curveRef  = useRef(null)
    const spectRef  = useRef(null)

    // Load datasets on mount
    useEffect(() => {
        fetch(`${BASE}/doppler/datasets`)
            .then(r => r.json())
            .then(d => setDatasets(d.files || []))
            .catch(() => {})
    }, [])

    const renderCharts = useCallback((data) => {
        if (waveRef.current) {
            Plotly.react(waveRef.current, [{
                x: data.waveform.time, y: data.waveform.amplitude,
                mode: 'lines', line: { color: '#638cff', width: 1 },
            }], { ...PLOT_LAYOUT, xaxis: { ...PLOT_LAYOUT.xaxis, title: 'Time (s)' }, yaxis: { ...PLOT_LAYOUT.yaxis, title: 'Amplitude' } }, PLOT_CFG)
        }
        if (fftRef.current) {
            Plotly.react(fftRef.current, [{
                x: data.fft.frequencies, y: data.fft.magnitudes,
                mode: 'lines', line: { color: '#a78bfa', width: 1.2 },
                fill: 'tozeroy', fillcolor: 'rgba(167,139,250,0.1)',
            }], { ...PLOT_LAYOUT, xaxis: { ...PLOT_LAYOUT.xaxis, title: 'Frequency (Hz)', range: [0, 3000] }, yaxis: { ...PLOT_LAYOUT.yaxis, title: 'Magnitude' } }, PLOT_CFG)
        }
        const d = data.doppler
        if (curveRef.current && d?.freq_over_time?.length) {
            const traces = [{
                x: d.freq_time_axis, y: d.freq_over_time,
                mode: 'lines', line: { color: '#34d399', width: 2 }, name: 'Dominant Freq',
            }]
            if (d.approach_freq_hz) {
                const xl = [d.freq_time_axis[0], d.freq_time_axis[d.freq_time_axis.length - 1]]
                traces.push({ x: xl, y: [d.approach_freq_hz, d.approach_freq_hz], mode: 'lines', line: { color: '#fbbf24', width: 1.5, dash: 'dash' }, name: `Approach (${d.approach_freq_hz} Hz)` })
                traces.push({ x: xl, y: [d.recede_freq_hz,   d.recede_freq_hz  ], mode: 'lines', line: { color: '#ef4444',  width: 1.5, dash: 'dash' }, name: `Recede (${d.recede_freq_hz} Hz)` })
            }
            Plotly.react(curveRef.current, traces, {
                ...PLOT_LAYOUT, showlegend: true, legend: { x: 0.6, y: 0.95, font: { size: 10 } },
                xaxis: { ...PLOT_LAYOUT.xaxis, title: 'Time (s)' }, yaxis: { ...PLOT_LAYOUT.yaxis, title: 'Frequency (Hz)' },
            }, PLOT_CFG)
        }
        if (spectRef.current && data.spectrogram) {
            Plotly.react(spectRef.current, [{
                x: data.spectrogram.times, y: data.spectrogram.frequencies, z: data.spectrogram.power,
                type: 'heatmap',
                colorscale: [[0,'#0a0e1a'],[0.2,'#1a1145'],[0.4,'#3b1f8e'],[0.6,'#638cff'],[0.8,'#34d399'],[1,'#fbbf24']],
                showscale: true, colorbar: { title: 'dB', titlefont: { size: 10 }, tickfont: { size: 9 } },
            }], { ...PLOT_LAYOUT, xaxis: { ...PLOT_LAYOUT.xaxis, title: 'Time (s)' }, yaxis: { ...PLOT_LAYOUT.yaxis, title: 'Frequency (Hz)', range: [0, 3000] } }, PLOT_CFG)
        }
    }, [])

    const analyze = async () => {
        if (!selected) return alert('Please select a file')
        setLoading(true); setResult(null)
        try {
            const res  = await fetch(`${BASE}/doppler/analyze/${encodeURIComponent(selected)}`)
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            setResult(data)
        } catch (e) { alert('Analysis failed: ' + e.message) }
        finally     { setLoading(false) }
    }

    const upload = async (file) => {
        if (!file) return
        setLoading(true); setResult(null)
        const form = new FormData(); form.append('file', file)
        try {
            const res  = await fetch(`${BASE}/doppler/upload`, { method: 'POST', body: form })
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            setResult(data)
        } catch (e) { alert('Upload failed: ' + e.message) }
        finally     { setLoading(false) }
    }

    useEffect(() => { if (result) renderCharts(result) }, [result, renderCharts])

    const d = result?.doppler

    const sidebar = (
        <div className="space-y-4">
            <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">📂 Dataset</h3>
                <select
                    value={selected}
                    onChange={e => setSelected(e.target.value)}
                    className="w-full bg-[rgba(10,14,26,0.8)] border border-[rgba(99,140,255,0.2)] rounded-lg px-3 py-2 text-sm text-gray-200 mb-3 outline-none focus:border-[#638cff]"
                >
                    <option value="">-- Select a file --</option>
                    {datasets.map(f => (
                        <option key={f.filename} value={f.filename}>
                            {f.filename}{f.actual_speed_kmh ? ` (${f.actual_speed_kmh} km/h)` : ''}
                        </option>
                    ))}
                </select>
                <PrimaryBtn onClick={analyze} loading={loading}>Analyze Signal</PrimaryBtn>
            </section>

            <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">📁 Upload Custom</h3>
                <FileUpload accept=".wav,.mp3" label="Drop .wav/.mp3 file" onFile={upload} />
            </section>

            {d && (
                <StatCard title="📊 Doppler Results">
                    <StatRow label="Estimated Speed" value={`${d.estimated_velocity_kmh} km/h`} valueStyle={{ color: '#34d399' }} />
                    <StatRow label="Estimated Freq"  value={`${d.estimated_frequency_hz} Hz`} />
                    <StatRow label="Approach Freq"   value={`${d.approach_freq_hz} Hz`} />
                    <StatRow label="Recede Freq"     value={`${d.recede_freq_hz} Hz`} />
                    {result.actual_speed_kmh && (<>
                        <StatRow label="Actual Speed" value={`${result.actual_speed_kmh} km/h`} valueStyle={{ color: '#fbbf24' }} />
                        <StatRow
                            label="Error"
                            value={(() => {
                                const est = d.estimated_velocity_kmh;
                                const act = result.actual_speed_kmh;
                                if (!act || act === 0) return "N/A";
                                const pct = Math.abs((est - act) / act) * 100;
                                return `${pct.toFixed(1)}%`;
                            })()}
                        />
                    </>)}
                    <StatRow label="Algorithm" value={d.algorithm} valueStyle={{ fontSize: 10 }} />
                </StatCard>
            )}

            {result?.statistics && (
                <StatCard title="📈 Signal Statistics">
                    <StatRow label="Duration"     value={`${result.statistics.duration_s}s`} />
                    <StatRow label="Sample Rate"  value={`${result.statistics.sample_rate} Hz`} />
                    <StatRow label="RMS"          value={result.statistics.rms} />
                    <StatRow label="SNR"          value={`${result.statistics.snr_db} dB`} />
                    <StatRow label="Peak-to-Peak" value={result.statistics.peak_to_peak} />
                </StatCard>
            )}
        </div>
    )

    return { sidebar, main: (
        <div>
            <Spinner active={loading} />
            {!result && !loading && (
                <EmptyState icon="📡" title="Doppler Signal Analysis"
                    desc="Select a recording from the dataset or upload your own to estimate vehicle speed" />
            )}
            {result && (
                <>
                    <ChartBox title="Waveform" height="h-[200px]">
                        <div ref={waveRef} className="h-full" />
                    </ChartBox>
                    <div className="grid grid-cols-2 gap-4">
                        <ChartBox title="FFT — Frequency Spectrum" height="h-[220px]">
                            <div ref={fftRef} className="h-full" />
                        </ChartBox>
                        <ChartBox title="Frequency Over Time (Doppler Curve)" height="h-[220px]">
                            <div ref={curveRef} className="h-full" />
                        </ChartBox>
                    </div>
                    <ChartBox title="Spectrogram" height="h-[260px]">
                        <div ref={spectRef} className="h-full" />
                    </ChartBox>
                </>
            )}
        </div>
    )}
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — DRONE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════
function DroneDetection() {
    const [loading, setLoading] = useState(false)
    const [result, setResult]   = useState(null)

    const waveRef  = useRef(null)
    const fftRef   = useRef(null)
    const featRef  = useRef(null)

    const renderCharts = useCallback((data) => {
        const isDrone = data.classification?.label === 'Drone Detected' || data.classification?.label === 'Possible Drone'
        const lineColor = isDrone ? '#34d399' : '#638cff'

        if (waveRef.current && data.waveform) {
            Plotly.react(waveRef.current, [{
                x: data.waveform.time, y: data.waveform.amplitude,
                mode: 'lines', line: { color: lineColor, width: 1 },
            }], { ...PLOT_LAYOUT, xaxis: { ...PLOT_LAYOUT.xaxis, title: 'Time (s)' }, yaxis: { ...PLOT_LAYOUT.yaxis, title: 'Amplitude' } }, PLOT_CFG)
        }
        if (fftRef.current && data.fft) {
            Plotly.react(fftRef.current, [{
                x: data.fft.frequencies, y: data.fft.magnitudes,
                mode: 'lines', line: { color: isDrone ? '#34d399' : '#a78bfa', width: 1.2 },
                fill: 'tozeroy', fillcolor: isDrone ? 'rgba(52,211,153,0.08)' : 'rgba(167,139,250,0.08)',
            }], { ...PLOT_LAYOUT, xaxis: { ...PLOT_LAYOUT.xaxis, title: 'Frequency (Hz)', range: [0, 5000] }, yaxis: { ...PLOT_LAYOUT.yaxis, title: 'Magnitude' } }, PLOT_CFG)
        }
        const f = data.features || {}
        if (featRef.current && f.spectral_centroid !== undefined) {
            Plotly.react(featRef.current, [{
                x: ['Centroid', 'Bandwidth', 'Rolloff', 'Dom. Freq', 'ZCR ×1000'],
                y: [f.spectral_centroid || 0, f.spectral_bandwidth || 0, f.spectral_rolloff || 0, f.dominant_freq || 0, (f.zero_crossing_rate || 0) * 1000],
                type: 'bar', marker: { color: lineColor, opacity: 0.85 },
            }], { ...PLOT_LAYOUT, yaxis: { ...PLOT_LAYOUT.yaxis, title: 'Value' } }, PLOT_CFG)
        }
    }, [])

    const upload = async (file) => {
        if (!file) return
        setLoading(true); setResult(null)
        const form = new FormData(); form.append('file', file)
        try {
            const res  = await fetch(`${BASE}/drone/upload`, { method: 'POST', body: form })
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            setResult(data)
        } catch (e) { alert('Classification failed: ' + e.message) }
        finally     { setLoading(false) }
    }

    useEffect(() => { if (result) renderCharts(result) }, [result, renderCharts])

    const c = result?.classification
    const isDrone = c?.label === 'Drone Detected' || c?.label === 'Possible Drone'

    const sidebar = (
        <div className="space-y-4">
            <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">🛸 Drone Detection</h3>
                <p className="text-xs text-[#7a8bb5] mb-3">
                    Upload any audio file (WAV or MP3) to classify it as a drone or other sound using spectral feature analysis.
                </p>
                <FileUpload accept=".wav,.mp3,.ogg,.flac" label="Drop audio file" onFile={upload} />
                <PrimaryBtn onClick={() => {}} loading={loading} className="mt-3 bg-gradient-to-r from-amber-500 to-yellow-500 shadow-[0_4px_15px_rgba(251,191,36,0.3)]">
                    🔍 Upload &amp; Classify
                </PrimaryBtn>
            </section>

            {c && (
                <StatCard title="📋 Classification Result">
                    <div className="mb-2">
                        <Badge label={c.label} conf={c.confidence} />
                    </div>
                    <StatRow label="File"       value={result.filename} />
                    <StatRow label="Confidence" value={`${(c.confidence * 100).toFixed(0)}%`} valueStyle={{ color: isDrone ? '#34d399' : '#ef4444' }} />
                    <StatRow label="Score"      value={c.score} />
                    {c.reasons?.length > 0 && (
                        <div className="mt-2 text-[11px] text-[#7a8bb5] space-y-0.5">
                            {c.reasons.map((r, i) => <div key={i}>• {r}</div>)}
                        </div>
                    )}
                </StatCard>
            )}

            {result?.statistics && (
                <StatCard title="📊 Signal Statistics">
                    <StatRow label="Duration"    value={`${result.statistics.duration_s}s`} />
                    <StatRow label="Sample Rate" value={`${result.statistics.sample_rate} Hz`} />
                    <StatRow label="RMS"         value={result.statistics.rms} />
                    <StatRow label="SNR"         value={`${result.statistics.snr_db} dB`} />
                </StatCard>
            )}
        </div>
    )

    return { sidebar, main: (
        <div>
            <Spinner active={loading} />
            {!result && !loading && (
                <EmptyState icon="🛸" title="Drone Sound Detection"
                    desc="Upload an audio file to classify it as a drone, bird, engine, or other sound" />
            )}
            {result && (
                <>
                    <ChartBox title="Waveform" height="h-[200px]">
                        <div ref={waveRef} className="h-full" />
                    </ChartBox>
                    <div className="grid grid-cols-2 gap-4">
                        <ChartBox title="FFT — Frequency Spectrum" height="h-[220px]">
                            <div ref={fftRef} className="h-full" />
                        </ChartBox>
                        <ChartBox title="Spectral Features" height="h-[220px]">
                            <div ref={featRef} className="h-full" />
                        </ChartBox>
                    </div>
                </>
            )}
        </div>
    )}
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const TABS = ['Doppler Simulator', 'Doppler Analysis', 'Drone Detection']

export default function Acoustic() {
    const [tab, setTab] = useState('Doppler Simulator')

    const sim      = DopplerSimulator()
    const analysis = DopplerAnalysis()
    const drone    = DroneDetection()

    const active = tab === 'Doppler Simulator' ? sim
                 : tab === 'Doppler Analysis'  ? analysis
                 : drone

    const tabDesc = {
        'Doppler Simulator': 'Simulate and hear the Doppler effect for any frequency and vehicle speed',
        'Doppler Analysis':  'Analyze a real recording to estimate vehicle speed from the Doppler shift',
        'Drone Detection':   'Classify audio as drone or other sound using spectral feature analysis',
    }

    return (
        <div className="flex min-h-screen bg-dark-bg">
            <Sidebar>
                <div className="mb-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Mode</h3>
                    <ToggleTabs tabs={TABS} active={tab} onChange={setTab} />
                </div>
                <div className="border-t border-dark-border my-3" />
                {active.sidebar}
            </Sidebar>

            <main className="ml-[260px] flex-1 p-6 overflow-y-auto min-h-screen">
                <h1 className="text-2xl font-bold text-white mb-1">🔊 Acoustic Signal Viewer</h1>
                <p className="text-sm text-gray-400 mb-6">{tabDesc[tab]}</p>
                {active.main}
            </main>
        </div>
    )
}
