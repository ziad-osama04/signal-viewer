import { useState, useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import Sidebar from '../components/Sidebar'
import ToggleTabs from '../components/ui/ToggleTabs'
import ChannelControl from '../components/ui/ChannelControl'
import SliderControl from '../components/ui/SliderControl'
import FileUpload from '../components/ui/FileUpload'
import ColormapSelector from '../components/ui/ColormapSelector'
import StatCard from '../components/ui/StatCard'

const DARK_LAYOUT = {
    paper_bgcolor: '#21263a',
    plot_bgcolor: '#21263a',
    font: { color: '#cbd5e1', family: 'Inter' },
    margin: { t: 30, r: 20, b: 40, l: 50 },
    xaxis: { gridcolor: '#2e3350', zerolinecolor: '#2e3350', autorange: false },
    yaxis: { gridcolor: '#2e3350', zerolinecolor: '#2e3350' },
}

const COLORS = [
    '#4f8ef7', '#22d3a5', '#f59e0b', '#ef4444', '#a78bfa',
    '#ec4899', '#6366f1', '#14b8a6', '#facc15', '#94a3b8',
    '#38bdf8', '#fb7185', '#fbbf24', '#34d399', '#818cf8'
]

// ─── Channel Pair Selector ────────────────────────────────────────────────────
function ChannelPairSelector({ channels, chA, chB, onChangeA, onChangeB }) {
    const opts = channels.map(c => (
        <option key={c.id} value={c.id}>{c.label}</option>
    ))
    return (
        <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Channel Selection</h3>
            <div className="space-y-2">
                <div>
                    <label className="text-xs text-gray-400 block mb-1">Channel A</label>
                    <select
                        value={chA}
                        onChange={e => onChangeA(Number(e.target.value))}
                        className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-1.5 text-xs text-gray-300"
                    >
                        {opts}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-gray-400 block mb-1">Channel B</label>
                    <select
                        value={chB}
                        onChange={e => onChangeB(Number(e.target.value))}
                        className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-1.5 text-xs text-gray-300"
                    >
                        {opts}
                    </select>
                </div>
            </div>
        </section>
    )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize array to 0..1 */
function normalize(arr) {
    let mn = arr[0], mx = arr[0]
    for (let i = 1; i < arr.length; i++) { if (arr[i] < mn) mn = arr[i]; if (arr[i] > mx) mx = arr[i] }
    const rng = mx - mn || 1
    return arr.map(v => (v - mn) / rng)
}

/** Binary threshold at 0.5 after normalization */
function binarize(arr) {
    const n = normalize(arr)
    return n.map(v => v >= 0.5 ? 1 : 0)
}

// ─── File format parsers ──────────────────────────────────────────────────────

/** Parse .hea header text → { fs, nSamples, nLeads, leadNames, gain[], baseline[], adcRes } */
function parseHea(text) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'))
    const header = lines[0].trim().split(/\s+/)
    const nLeads      = parseInt(header[1]) || 1
    const fs          = parseFloat(header[2]) || 360
    const nSamplesHdr = parseInt(header[3]) || 0
    const leads = [], gains = [], baselines = []
    for (let i = 1; i <= nLeads && i < lines.length; i++) {
        const p = lines[i].trim().split(/\s+/)
        // p[2] = gain like "200(0)/mV" or "200/mV" or "200"
        const gainField = p[2] || '200'
        const gainRaw   = gainField.split('/')[0].replace(/\(.*?\)/, '')
        gains.push(parseFloat(gainRaw) || 200)
        const baseMatch = gainField.match(/\((-?\d+)\)/)
        baselines.push(baseMatch ? parseInt(baseMatch[1]) : 0)
        // lead name = last token on signal-spec line
        leads.push(p[p.length - 1] || `Lead${i}`)
    }
    return { fs, nSamples: nSamplesHdr, nLeads, leadNames: leads, gains, baselines }
}

/** Parse binary .dat — WFDB format 16 (16-bit signed little-endian, multiplexed frames) */
function parseDat(buffer, meta) {
    const { nLeads, gains, baselines, nSamples: nSamplesHdr } = meta
    const totalBytes    = buffer.byteLength
    const bytesPerFrame = nLeads * 2
    if (bytesPerFrame === 0) throw new Error('nLeads is 0 — check your .hea file')
    // Use header nSamples if valid, else derive from file size
    const nSamples = (nSamplesHdr > 0)
        ? Math.min(nSamplesHdr, Math.floor(totalBytes / bytesPerFrame))
        : Math.floor(totalBytes / bytesPerFrame)
    if (nSamples === 0) throw new Error(`No samples decoded — bytes=${totalBytes} nLeads=${nLeads}`)
    const view   = new DataView(buffer)
    const traces = Array.from({ length: nLeads }, () => new Float32Array(nSamples))
    for (let s = 0; s < nSamples; s++) {
        const frameOff = s * bytesPerFrame
        for (let ch = 0; ch < nLeads; ch++) {
            const off = frameOff + ch * 2
            if (off + 2 > totalBytes) break   // safety guard for trailing padding
            const raw = view.getInt16(off, true)
            traces[ch][s] = (raw - (baselines[ch] || 0)) / (gains[ch] || 200)
        }
    }
    return traces.map(t => Array.from(t))
}

/** Parse .xyz text (whitespace-separated rows, one column per lead) */
function parseXyz(text) {
    const rows = text.trim().split(/\r?\n/).map(r => r.trim().split(/[\s,]+/).map(Number))
    if (!rows.length) return []
    const nLeads = rows[0].length
    const traces = Array.from({ length: nLeads }, () => [])
    rows.forEach(row => row.forEach((v, i) => { if (i < nLeads) traces[i].push(v) }))
    return traces
}

// Class label maps
const ECG_CLASSES = ['NORM', 'MI', 'STTC', 'CD', 'HYP']
const EEG_CLASSES = ['ADFSU', 'Depression', 'REEG-PD', 'BrainLat']

/** Resolve a prediction value: if it's a number map to label based on signal type */
function resolveLabel(pred, signalType = 'ecg') {
    if (pred === null || pred === undefined) return '—'
    const classes = signalType === 'eeg' ? EEG_CLASSES : ECG_CLASSES
    if (typeof pred === 'number' || (typeof pred === 'string' && /^\d+$/.test(pred))) {
        return classes[parseInt(pred)] ?? `Class ${pred}`
    }
    return String(pred)
}

export default function Medical() {
    // --- UI STATE ---
    const [signalType, setSignalType] = useState('ecg')  // 'ecg' | 'eeg'
    const [fileFormat, setFileFormat] = useState('csv')
    const [viewerMode, setViewerMode] = useState('Continuous')
    const [displayMode, setDisplayMode] = useState('Multi-Panel')
    const [playing, setPlaying] = useState(false)
    const [speed, setSpeed] = useState(1)
    const [chunkSize, setChunkSize] = useState(64)
    const [polarMode, setPolarMode] = useState('Rolling')
    const [colormap, setColormap] = useState('Viridis')

    // Channel pair for non-continuous modes
    const [chA, setChA] = useState(0)
    const [chB, setChB] = useState(1)
    const [periodicity, setPeriodicity] = useState(360)
    const [sampleCount, setSampleCount] = useState(1000)
    const [allSamples, setAllSamples] = useState(false)

    // --- DYNAMIC CHANNELS ---
    const [channels, setChannels] = useState([])

    // --- DATA STATE ---
    const [graphData, setGraphData] = useState(null)
    const [heaMeta, setHeaMeta] = useState(null)
    const [xyzData, setXyzData] = useState(null)   // stored for model, not visualized
    const [datFileRef, setDatFileRef] = useState(null)  // raw .dat File object for sending
    const [wfdbAnalysing, setWfdbAnalysing] = useState(false)
    const [aiReport, setAiReport] = useState(null)
    const [mlReport, setMlReport] = useState(null)
    const [loading, setLoading] = useState(false)

    // --- DYNAMIC REFS ---
    const continuousRefs = useRef([])
    const overlayRef = useRef(null)
    const polarRef = useRef(null)
    const recurrenceRef = useRef(null)
    const xorRef = useRef(null)

    // --- PLAYBACK REFS ---
    const playIntervalRef = useRef(null)
    const playIndexRef = useRef(0)
    const stoppedIndexRef = useRef(0)

    // --- ZOOM STATE ---
    const [windowSize, setWindowSize] = useState(300)
    const zoomIn = () => setWindowSize(prev => Math.max(100, prev - 200))
    const zoomOut = () => setWindowSize(prev => Math.min(5000, prev + 500))
    const minWindowSize = 100
    const maxWindowSize = 5000

    // --- HANDLERS ---
    const toggleChannel = (id) => setChannels(prev => prev.map(c => c.id === id ? { ...c, visible: !c.visible } : c))
    const changeColor = (id, color) => setChannels(prev => prev.map(c => c.id === id ? { ...c, color } : c))
    const changeThickness = (id, thickness) => setChannels(prev => prev.map(c => c.id === id ? { ...c, thickness } : c))

    // Ensure chA/chB stay valid when channels change
    useEffect(() => {
        if (channels.length > 0) {
            setChA(prev => Math.min(prev, channels.length - 1))
            setChB(prev => Math.min(Math.max(prev, 0), channels.length - 1))
        }
    }, [channels])

    // --- PLAYBACK EFFECT ---
    useEffect(() => {
        if (playing && graphData) {
            const totalPoints = graphData.time.length
            const wsize = windowSize

            playIntervalRef.current = setInterval(() => {
                playIndexRef.current += (5 * speed)
                if (playIndexRef.current > totalPoints - wsize) playIndexRef.current = 0

                const update = { 'xaxis.range': [playIndexRef.current, playIndexRef.current + wsize] }
                channels.forEach(ch => {
                    if (ch.visible && continuousRefs.current[ch.id]) {
                        Plotly.relayout(continuousRefs.current[ch.id], update)
                    }
                })
                if (displayMode === 'Overlay' && overlayRef.current) {
                    Plotly.relayout(overlayRef.current, update)
                }
            }, 30)
        } else {
            clearInterval(playIntervalRef.current)
        }
        return () => clearInterval(playIntervalRef.current)
    }, [playing, speed, graphData, windowSize])

    // --- FILE UPLOAD HANDLER (csv + xyz only; wfdb handled inline in sidebar) ---
    const handleFileUpload = async (file) => {
        if (!file) return
        setLoading(true)
        setPlaying(false)
        playIndexRef.current = 0
        stoppedIndexRef.current = 0
        setWindowSize(1000)
        setAiReport(null)
        setMlReport(null)
        try {
            if (signalType === 'eeg') {
                // EEG — send directly to /api/eeg/process (.npy or .csv)
                const formData = new FormData()
                formData.append('file', file)
                const res  = await fetch('http://127.0.0.1:8000/api/eeg/process', { method: 'POST', body: formData })
                const data = await res.json()
                if (data.error) { alert(data.details || data.error); return }
                // EEG response: { analysis: { cnn, svm }, signals, time }
                setAiReport(data.analysis?.cnn  ?? data.analysis?.ai_model  ?? null)
                setMlReport(data.analysis?.svm  ?? data.analysis?.classic_ml ?? null)
                const keys = Object.keys(data.signals || {})
                if (keys.length) _applySignals(keys, keys.map(k => data.signals[k]), data.time)
            } else if (fileFormat === 'csv') {
                // ECG CSV → backend
                const formData = new FormData()
                formData.append('file', file)
                const res  = await fetch('http://127.0.0.1:8000/api/medical/process', { method: 'POST', body: formData })
                const data = await res.json()
                if (data.error) { alert(data.details); return }
                setAiReport(data.analysis.ai_model)
                setMlReport(data.analysis.classic_ml)
                const keys = Object.keys(data.signals || {})
                _applySignals(keys, keys.map(k => data.signals[k]), data.time)
            } else if (fileFormat === 'xyz') {
                const text = await file.text()
                const traces = parseXyz(text)
                const n = traces[0]?.length || 0
                _applySignals(traces.map((_, i) => `XYZ_${i + 1}`), traces, Array.from({ length: n }, (_, i) => i))
            }
        } catch (err) {
            console.error(err)
            alert(`Error: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    const _applySignals = (keys, traces, time) => {
        const newChannels = keys.map((key, index) => ({
            id: index, label: key, visible: true,
            color: COLORS[index % COLORS.length], thickness: 1.5
        }))
        setChannels(newChannels)
        setChA(0)
        setChB(Math.min(1, keys.length - 1))
        const firstTrace = traces[0] || []
        setSampleCount(Math.min(Math.max(500, Math.floor(firstTrace.length * 0.1)), 3000))
        setAllSamples(false)
        setGraphData({ time, traces })
    }

    // --- CONTINUOUS RENDER ---
    useEffect(() => {
        if (!graphData || viewerMode !== 'Continuous') return
        const visibleChannels = channels.filter(c => c.visible && c.id < graphData.traces.length)
        const xIndices = Array.from(graphData.time.keys())
        let xRange = [0, windowSize]
        if (playing) xRange = [playIndexRef.current, playIndexRef.current + windowSize]
        else if (stoppedIndexRef.current !== undefined) xRange = [stoppedIndexRef.current, stoppedIndexRef.current + windowSize]

        if (displayMode === 'Multi-Panel') {
            visibleChannels.forEach((ch) => {
                const el = continuousRefs.current[ch.id]
                if (!el) return
                Plotly.react(el, [{
                    x: xIndices, y: graphData.traces[ch.id],
                    type: 'scatter', mode: 'lines',
                    line: { color: ch.color, width: ch.thickness },
                    name: ch.label,
                }], {
                    ...DARK_LAYOUT, height: 160,
                    title: { text: ch.label, font: { size: 11, color: '#94a3b8' }, x: 0.05 },
                    margin: { t: 30, r: 20, b: 30, l: 50 },
                    showlegend: false,
                    xaxis: { ...DARK_LAYOUT.xaxis, range: xRange }
                }, { responsive: true, displayModeBar: false })
            })
        } else {
            if (!overlayRef.current) return
            const traces = visibleChannels.map(ch => ({
                x: xIndices, y: graphData.traces[ch.id],
                type: 'scatter', mode: 'lines',
                line: { color: ch.color, width: ch.thickness },
                name: ch.label,
            }))
            Plotly.react(overlayRef.current, traces, {
                ...DARK_LAYOUT, height: 550,
                xaxis: { ...DARK_LAYOUT.xaxis, range: xRange }
            }, { responsive: true })
        }
    }, [graphData, viewerMode, displayMode, channels, playing, windowSize])

    // --- POLAR RENDER: r = |chA[i]| / (|chB[i]| + ε), theta = (i / periodicity) * 360 ---
    useEffect(() => {
        if (viewerMode !== 'Polar' || !polarRef.current) return

        if (graphData && graphData.traces[chA] && graphData.traces[chB]) {
            const fullA = graphData.traces[chA]
            const fullB = graphData.traces[chB]
            const totalN = Math.min(fullA.length, fullB.length)
            const n = allSamples ? totalN : Math.min(sampleCount, totalN)
            const sigA = fullA.slice(0, n)
            const sigB = fullB.slice(0, n)
            const chALabel = channels[chA]?.label || `CH${chA + 1}`
            const chBLabel = channels[chB]?.label || `CH${chB + 1}`
            const colorA = channels[chA]?.color || '#4f8ef7'

            // r = |A| / (|B| + ε), then normalize to 0–1 via 95th-percentile clip to avoid 350k spikes
            const rRaw = sigA.map((v, i) => Math.abs(v) / (Math.abs(sigB[i]) + 1e-6))
            const sorted = [...rRaw].sort((a, b) => a - b)
            const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1
            const r = rRaw.map(v => Math.min(v, p95) / p95)   // normalized 0..1

            // theta = sample index wraps every `periodicity` samples → one full 360° revolution
            const theta = sigA.map((_, i) => ((i % periodicity) / periodicity) * 360)

            Plotly.react(polarRef.current, [{
                type: 'scatterpolar',
                mode: 'lines',
                r,
                theta,
                line: { color: colorA, width: 1.2 },
                name: `|${chALabel}| / |${chBLabel}| (norm)`,
            }], {
                ...DARK_LAYOUT,
                height: 520,
                polar: {
                    bgcolor: '#21263a',
                    radialaxis: {
                        gridcolor: '#2e3350', linecolor: '#2e3350',
                        tickfont: { color: '#64748b' },
                        range: [0, 1],
                        tickvals: [0, 0.25, 0.5, 0.75, 1],
                        ticktext: ['0', '0.25', '0.5', '0.75', '1'],
                    },
                    angularaxis: { gridcolor: '#2e3350', linecolor: '#2e3350', tickfont: { color: '#64748b' }, direction: 'clockwise' },
                },
                showlegend: false,
                title: {
                    text: `Polar — r=|${chALabel}|/|${chBLabel}| (norm·p95)  period=${periodicity} samp  n=${n.toLocaleString()}`,
                    font: { size: 11, color: '#94a3b8' }
                },
            }, { responsive: true, displayModeBar: false })
        } else {
            // Demo if no data
            const r = Array.from({ length: 400 }, (_, i) => 0.5 + 0.3 * Math.sin(i * 0.1))
            const theta = Array.from({ length: 400 }, (_, i) => (i / 400) * 360)
            Plotly.react(polarRef.current, [{
                type: 'scatterpolar', mode: 'lines', r, theta,
                line: { color: '#4f8ef7', width: 1.5 },
            }], {
                ...DARK_LAYOUT, height: 520,
                polar: {
                    bgcolor: '#21263a',
                    radialaxis: { gridcolor: '#2e3350', linecolor: '#2e3350', tickfont: { color: '#64748b' } },
                    angularaxis: { gridcolor: '#2e3350', linecolor: '#2e3350', tickfont: { color: '#64748b' } },
                },
                showlegend: false,
            }, { responsive: true, displayModeBar: false })
        }
    }, [viewerMode, graphData, chA, chB, channels, periodicity, sampleCount, allSamples])

    // --- XOR RENDER: chunk both signals, XOR each chunk, plot per-chunk XOR energy ---
    useEffect(() => {
        if (viewerMode !== 'XOR' || !xorRef.current) return

        if (graphData && graphData.traces[chA] && graphData.traces[chB]) {
            const rawA = graphData.traces[chA]
            const rawB = graphData.traces[chB]
            const chALabel = channels[chA]?.label || `CH${chA + 1}`
            const chBLabel = channels[chB]?.label || `CH${chB + 1}`

            // Split into chunks of `chunkSize`, binarize each chunk, XOR, compute energy per chunk
            const numChunks = Math.floor(rawA.length / chunkSize)
            const chunkIndices = Array.from({ length: numChunks }, (_, c) => c * chunkSize)
            const xorEnergy = chunkIndices.map((start) => {
                const sliceA = rawA.slice(start, start + chunkSize)
                const sliceB = rawB.slice(start, start + chunkSize)
                const binA = binarize(sliceA)
                const binB = binarize(sliceB)
                return binA.reduce((acc, v, i) => acc + (v ^ binB[i]), 0) / chunkSize
            })

            // Also show full-resolution binarized signals for context
            const binA = binarize(rawA)
            const binB = binarize(rawB)
            const xored = binA.map((v, i) => v ^ binB[i])
            const allIdx = Array.from({ length: rawA.length }, (_, i) => i)

            Plotly.react(xorRef.current, [
                {
                    x: allIdx, y: binA,
                    type: 'scatter', mode: 'lines',
                    line: { color: channels[chA]?.color || '#4f8ef7', width: 0.8 },
                    name: `${chALabel} (binary)`, opacity: 0.4,
                },
                {
                    x: allIdx, y: binB,
                    type: 'scatter', mode: 'lines',
                    line: { color: channels[chB]?.color || '#22d3a5', width: 0.8 },
                    name: `${chBLabel} (binary)`, opacity: 0.4,
                },
                {
                    x: allIdx, y: xored,
                    type: 'scatter', mode: 'lines',
                    line: { color: '#f59e0b', width: 1 },
                    name: `${chALabel} ⊕ ${chBLabel}`,
                    fill: 'tozeroy', fillcolor: 'rgba(245,158,11,0.08)',
                },
                {
                    // XOR energy per chunk — bar chart on secondary y
                    x: chunkIndices, y: xorEnergy,
                    type: 'bar',
                    marker: { color: 'rgba(239,68,68,0.6)', line: { color: '#ef4444', width: 1 } },
                    name: `XOR Energy (chunk=${chunkSize})`,
                    yaxis: 'y2',
                    width: chunkSize * 0.8,
                },
            ], {
                ...DARK_LAYOUT,
                height: 520,
                xaxis: { ...DARK_LAYOUT.xaxis, autorange: true, title: { text: 'Sample', font: { color: '#94a3b8' } } },
                yaxis: { ...DARK_LAYOUT.yaxis, autorange: true, title: { text: 'Binary', font: { color: '#94a3b8' } } },
                yaxis2: {
                    overlaying: 'y', side: 'right', autorange: true,
                    gridcolor: '#2e3350', zerolinecolor: '#2e3350',
                    title: { text: 'XOR Energy', font: { color: '#ef4444', size: 10 } },
                    tickfont: { color: '#ef4444' },
                },
                title: { text: `XOR — ${chALabel} ⊕ ${chBLabel} | chunk=${chunkSize}`, font: { size: 13, color: '#94a3b8' } },
                legend: { font: { color: '#94a3b8', size: 10 }, bgcolor: 'transparent' },
                barmode: 'overlay',
            }, { responsive: true, displayModeBar: false })
        } else {
            Plotly.react(xorRef.current, [], { ...DARK_LAYOUT, height: 520 }, { responsive: true, displayModeBar: false })
        }
    }, [viewerMode, graphData, chA, chB, channels, chunkSize])

    // --- RECURRENCE / TRAJECTORY RENDER: chA[t] vs chB[t] line over time ---
    useEffect(() => {
        if (viewerMode !== 'Recurrence' || !recurrenceRef.current) return

        if (graphData && graphData.traces[chA] && graphData.traces[chB]) {
            const fullA = graphData.traces[chA]
            const fullB = graphData.traces[chB]
            const totalN = Math.min(fullA.length, fullB.length)
            const n = allSamples ? totalN : Math.min(sampleCount, totalN)
            const sigA = fullA.slice(0, n)
            const sigB = fullB.slice(0, n)
            const chALabel = channels[chA]?.label || `CH${chA + 1}`
            const chBLabel = channels[chB]?.label || `CH${chB + 1}`

            // Color-encode time using a gradient via multiple segments would be slow;
            // use a single scatter with marker color = time index for color-coded trajectory
            const timeIdx = Array.from({ length: n }, (_, i) => i)

            Plotly.react(recurrenceRef.current, [
                {
                    // Trajectory line (faint)
                    x: sigA, y: sigB,
                    type: 'scatter', mode: 'lines',
                    line: { color: 'rgba(79,142,247,0.25)', width: 1 },
                    showlegend: false,
                },
                {
                    // Color-coded by time
                    x: sigA, y: sigB,
                    type: 'scatter', mode: 'markers',
                    marker: {
                        color: timeIdx,
                        colorscale: colormap,
                        size: 2.5,
                        showscale: true,
                        colorbar: {
                            title: { text: 'Time (sample)', font: { color: '#94a3b8', size: 10 } },
                            tickfont: { color: '#94a3b8', size: 9 },
                            thickness: 12,
                        },
                    },
                    name: 'Trajectory',
                },
                {
                    // Start marker
                    x: [sigA[0]], y: [sigB[0]],
                    type: 'scatter', mode: 'markers',
                    marker: { color: '#22d3a5', size: 9, symbol: 'circle', line: { color: '#fff', width: 1.5 } },
                    name: 't=0 (start)',
                },
                {
                    // End marker
                    x: [sigA[n - 1]], y: [sigB[n - 1]],
                    type: 'scatter', mode: 'markers',
                    marker: { color: '#ef4444', size: 9, symbol: 'square', line: { color: '#fff', width: 1.5 } },
                    name: `t=${n - 1} (end)`,
                },
            ], {
                ...DARK_LAYOUT,
                height: 520,
                xaxis: { ...DARK_LAYOUT.xaxis, autorange: true, title: { text: chALabel, font: { color: '#94a3b8' } } },
                yaxis: { ...DARK_LAYOUT.yaxis, autorange: true, title: { text: chBLabel, font: { color: '#94a3b8' } } },
                title: {
                    text: `Trajectory — ${chALabel} vs ${chBLabel} over time`,
                    font: { size: 13, color: '#94a3b8' }
                },
                legend: { font: { color: '#94a3b8', size: 10 }, bgcolor: 'transparent' },
            }, { responsive: true, displayModeBar: false })
        } else {
            // Demo Lissajous trajectory
            const t = Array.from({ length: 500 }, (_, i) => i / 500 * Math.PI * 6)
            const x = t.map(v => Math.sin(3 * v))
            const y = t.map(v => Math.sin(2 * v + Math.PI / 4))
            Plotly.react(recurrenceRef.current, [{
                x, y, type: 'scatter', mode: 'lines',
                line: { color: '#4f8ef7', width: 1.5 },
                name: 'Demo trajectory',
            }], {
                ...DARK_LAYOUT, height: 520,
                xaxis: { ...DARK_LAYOUT.xaxis, autorange: true },
                yaxis: { ...DARK_LAYOUT.yaxis, autorange: true },
                title: { text: 'Trajectory — upload a file to view real data', font: { size: 12, color: '#94a3b8' } },
            }, { responsive: true, displayModeBar: false })
        }
    }, [viewerMode, colormap, chA, chB, graphData, channels, sampleCount, allSamples])

    // Whether we're in an advanced (non-continuous) mode
    const isAdvancedMode = viewerMode !== 'Continuous'

    // --- SIDEBAR CONTENT ---
    const sidebarContent = (
        <div className="flex flex-col gap-4">

            {/* ── Signal type selector ── */}
            <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Signal Type</h3>
                <div className="grid grid-cols-2 gap-1">
                    {[
                        { id: 'ecg', label: '🫀 ECG' },
                        { id: 'eeg', label: '🧠 EEG' },
                    ].map(({ id, label }) => (
                        <button
                            key={id}
                            onClick={() => {
                                setSignalType(id)
                                setFileFormat('csv')
                                setGraphData(null)
                                setChannels([])
                                setHeaMeta(null)
                                setXyzData(null)
                                setDatFileRef(null)
                                setAiReport(null)
                                setMlReport(null)
                            }}
                            className={`text-sm py-2 rounded-lg font-semibold transition-colors border ${
                                signalType === id
                                    ? id === 'ecg'
                                        ? 'bg-accent-blue/20 border-accent-blue text-accent-blue'
                                        : 'bg-purple-500/20 border-purple-400 text-purple-300'
                                    : 'bg-dark-bg border-dark-border text-gray-500 hover:text-gray-300'
                            }`}
                        >{label}</button>
                    ))}
                </div>
            </section>

            <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Signal Input</h3>

                {/* Format selector — ECG: CSV / WFDB+XYZ  |  EEG: CSV / NPY */}
                <div className="grid grid-cols-2 gap-1 mb-3">
                    {(signalType === 'eeg'
                        ? [{ id: 'csv', label: '.csv' }, { id: 'npy', label: '.npy' }]
                        : [{ id: 'csv', label: '.csv' }, { id: 'wfdb', label: '.hea + .dat + .xyz' }]
                    ).map(({ id, label }) => (
                        <button
                            key={id}
                            onClick={() => { setFileFormat(id); setHeaMeta(null); setXyzData(null); setDatFileRef(null); setAiReport(null); setMlReport(null) }}
                            className={`text-xs py-1.5 rounded-lg font-mono font-semibold transition-colors border ${
                                fileFormat === id
                                    ? signalType === 'eeg'
                                        ? 'bg-purple-500/20 border-purple-400 text-purple-300'
                                        : 'bg-accent-blue/20 border-accent-blue text-accent-blue'
                                    : 'bg-dark-bg border-dark-border text-gray-500 hover:text-gray-300'
                            }`}
                        >{label}</button>
                    ))}
                </div>

                {/* CSV — single upload */}
                {fileFormat === 'csv' && (
                    <>
                        <p className="text-xs text-gray-600 mb-2">
                            {signalType === 'eeg'
                                ? 'EEG CSV: rows = samples, columns = channels (19 ch expected)'
                                : 'ECG CSV: columns = leads, rows = samples'}
                        </p>
                        <FileUpload accept=".csv" label="Drop .csv file" onFile={handleFileUpload} />
                    </>
                )}

                {/* NPY — EEG only */}
                {fileFormat === 'npy' && signalType === 'eeg' && (
                    <>
                        <p className="text-xs text-gray-600 mb-2">
                            NumPy array — shape (T, 19) or (19, T) or (N, T, 19).<br/>
                            Sliding window (256 samp, step 128) applied automatically.
                        </p>
                        <FileUpload accept=".npy" label="Drop .npy file" onFile={handleFileUpload} />
                    </>
                )}

                {/* WFDB — ECG only */}
                {fileFormat === 'wfdb' && signalType === 'ecg' && (
                    <div className="space-y-2">
                        {/* ① .hea header */}
                        <div className={`rounded-lg border p-2 transition-colors ${heaMeta ? 'border-accent-green/50 bg-accent-green/5' : 'border-dark-border'}`}>
                            <p className={`text-xs font-semibold mb-1.5 ${heaMeta ? 'text-accent-green' : 'text-gray-400'}`}>
                                {heaMeta ? `✓ ${heaMeta.nLeads} leads @ ${heaMeta.fs} Hz` : '① Header (.hea)'}
                            </p>
                            <FileUpload
                                accept=".hea"
                                label="Drop .hea"
                                onFile={async (file) => {
                                    if (!file) return
                                    try {
                                        const text = await file.text()
                                        const meta = parseHea(text)
                                        setHeaMeta(meta)
                                    } catch(e) { alert('Failed to parse .hea: ' + e.message) }
                                }}
                            />
                        </div>

                        {/* ② .dat binary signal — needs .hea first */}
                        <div className={`rounded-lg border p-2 transition-colors ${!heaMeta ? 'opacity-40 pointer-events-none border-dark-border' : 'border-dark-border'}`}>
                            <p className="text-xs font-semibold text-gray-400 mb-1.5">② Signal (.dat)</p>
                            <FileUpload
                                accept=".dat"
                                label="Drop .dat"
                                onFile={async (file) => {
                                    if (!file || !heaMeta) return
                                    setLoading(true)
                                    setDatFileRef(file)          // keep ref for analysis
                                    setAiReport(null)
                                    setMlReport(null)
                                    try {
                                        const buf = await file.arrayBuffer()
                                        const traces = parseDat(buf, heaMeta)
                                        const n = traces[0]?.length || 0
                                        const time = Array.from({ length: n }, (_, i) => i / heaMeta.fs)
                                        _applySignals(heaMeta.leadNames, traces, time)
                                    } catch(e) { alert('Failed to parse .dat: ' + e.message) }
                                    finally { setLoading(false) }
                                }}
                            />
                        </div>

                        {/* ③ .xyz — stored for model use, not visualized */}
                        <div className={`rounded-lg border p-2 transition-colors ${xyzData ? 'border-accent-green/50 bg-accent-green/5' : 'border-dark-border'}`}>
                            <p className={`text-xs font-semibold mb-1.5 ${xyzData ? 'text-accent-green' : 'text-gray-400'}`}>
                                {xyzData ? `✓ XYZ loaded: ${xyzData.nLeads} leads × ${xyzData.nSamples} samp` : '③ Frank XYZ (.xyz)'}
                            </p>
                            <FileUpload
                                accept=".xyz,.txt"
                                label="Drop .xyz"
                                onFile={async (file) => {
                                    if (!file) return
                                    try {
                                        const text = await file.text()
                                        const traces = parseXyz(text)
                                        const n = traces[0]?.length || 0
                                        // Store raw data for model — visual stays on .dat signal
                                        setXyzData({ traces, nLeads: traces.length, nSamples: n, raw: text })
                                    } catch(e) { alert('Failed to parse .xyz: ' + e.message) }
                                }}
                            />
                            <p className="text-xs text-gray-600 mt-1">Stored for ML model, not visualized</p>
                        </div>

                        {/* ── Send for Analysis ── */}
                        {datFileRef && heaMeta && (
                            <button
                                disabled={wfdbAnalysing}
                                onClick={async () => {
                                    setWfdbAnalysing(true)
                                    setAiReport(null)
                                    setMlReport(null)
                                    try {
                                        const form = new FormData()
                                        form.append('dat_file', datFileRef)
                                        form.append('meta', JSON.stringify({
                                            nLeads:    heaMeta.nLeads,
                                            fs:        heaMeta.fs,
                                            nSamples:  heaMeta.nSamples,
                                            leadNames: heaMeta.leadNames,
                                            gains:     heaMeta.gains,
                                            baselines: heaMeta.baselines,
                                        }))
                                        if (xyzData?.raw) {
                                            const xyzBlob = new Blob([xyzData.raw], { type: 'text/plain' })
                                            form.append('xyz_file', xyzBlob, 'signal.xyz')
                                        }
                                        const res  = await fetch('http://127.0.0.1:8000/api/medical/process-wfdb', {
                                            method: 'POST', body: form
                                        })
                                        const data = await res.json()
                                        if (data.error) {
                                            alert(`Analysis error: ${data.details}`)
                                        } else {
                                            setAiReport(data.analysis?.ai_model   ?? null)
                                            setMlReport(data.analysis?.classic_ml ?? null)
                                        }
                                    } catch(e) {
                                        alert(`Request failed: ${e.message}`)
                                    } finally {
                                        setWfdbAnalysing(false)
                                    }
                                }}
                                className={`w-full mt-1 py-2 rounded-lg text-xs font-bold transition-colors border flex items-center justify-center gap-2 ${
                                    wfdbAnalysing
                                        ? 'bg-dark-bg border-dark-border text-gray-500 cursor-not-allowed'
                                        : 'bg-accent-blue/10 border-accent-blue text-accent-blue hover:bg-accent-blue/20'
                                }`}
                            >
                                {wfdbAnalysing
                                    ? <><span className="animate-spin">⟳</span> Analysing…</>
                                    : '🔬 Send for Analysis'}
                            </button>
                        )}

                        {/* AI / ML results inline for WFDB */}
                        {(aiReport || mlReport) && (
                            <div className="space-y-2 mt-1">
                                {aiReport && (
                                    <div className="rounded-lg border border-dark-border bg-dark-bg/60 p-2.5">
                                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">AI Report</p>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${aiReport.prediction === 'NORM' ? 'bg-accent-green/20 text-accent-green' : 'bg-red-500/20 text-red-400'}`}>
                                            {aiReport.prediction}
                                        </span>
                                        <p className="text-xs text-gray-400 mt-1">Confidence: {aiReport.confidence > 2 ? aiReport.confidence.toFixed(1) : (aiReport.confidence * 100).toFixed(1)}%</p>
                                    </div>
                                )}
                                {mlReport && (
                                    <div className="rounded-lg border border-dark-border bg-dark-bg/60 p-2.5">
                                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Classic ML (RF)</p>
                                        <p className="text-xs text-white">{resolveLabel(mlReport.prediction)}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {loading && <p className="text-xs text-accent-blue mt-2 animate-pulse">Processing…</p>}
            </section>

            <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Viewer Mode</h3>
                <ToggleTabs tabs={['Continuous', 'XOR', 'Polar', 'Recurrence']} active={viewerMode} onChange={setViewerMode} />
            </section>

            {/* ── CONTINUOUS: display toggle + leads ── */}
            {!isAdvancedMode && (
                <>
                    <section>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Display</h3>
                        <div className="flex gap-4">
                            {['Multi-Panel', 'Overlay'].map((m) => (
                                <label key={m} className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
                                    <input type="radio" checked={displayMode === m} onChange={() => setDisplayMode(m)} className="accent-accent-blue" />
                                    {m}
                                </label>
                            ))}
                        </div>
                    </section>

                    <section>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Leads ({channels.length})</h3>
                        <div className="max-h-[280px] overflow-y-auto pr-2 custom-scrollbar border border-dark-border/30 rounded-lg p-2 bg-dark-bg/50">
                            <ChannelControl channels={channels} onToggle={toggleChannel} onColorChange={changeColor} onThicknessChange={changeThickness} />
                        </div>
                    </section>
                </>
            )}

            {/* ── ADVANCED: channel pair selector ── */}
            {isAdvancedMode && channels.length > 0 && (
                <ChannelPairSelector
                    channels={channels}
                    chA={chA}
                    chB={chB}
                    onChangeA={setChA}
                    onChangeB={setChB}
                />
            )}

            {/* ── CONTINUOUS: playback controls ── */}
            {!isAdvancedMode && (
                <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Playback</h3>
                    <div className="flex gap-2 mb-2">
                        <button
                            onClick={() => {
                                setPlaying((v) => {
                                    if (v) stoppedIndexRef.current = playIndexRef.current
                                    else playIndexRef.current = stoppedIndexRef.current
                                    return !v
                                })
                            }}
                            className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors ${playing ? 'bg-red-500/20 text-red-400' : 'bg-accent-green/20 text-accent-green'}`}>
                            {playing ? '⏹ Stop' : '▶ Play'}
                        </button>
                        <button
                            onClick={() => {
                                playIndexRef.current = 0
                                stoppedIndexRef.current = 0
                                if (!playing) setPlaying(true)
                            }}
                            className="px-3 text-xs bg-dark-bg border border-dark-border rounded-lg text-gray-400 hover:text-white">
                            Reset
                        </button>
                        <button className="px-3 text-xs bg-dark-bg border border-dark-border rounded-lg text-gray-400 hover:text-white" onClick={zoomIn} disabled={windowSize <= minWindowSize} title="Zoom In">🔍+</button>
                        <button className="px-3 text-xs bg-dark-bg border border-dark-border rounded-lg text-gray-400 hover:text-white" onClick={zoomOut} disabled={windowSize >= maxWindowSize} title="Zoom Out">🔍−</button>
                    </div>
                    <SliderControl label="Speed" min={0.25} max={4} step={0.25} value={speed} onChange={setSpeed} unit="×" />
                    <div className="text-xs mt-1 text-gray-600">Window: {windowSize} samples</div>
                </section>
            )}

            {/* ── MODE-SPECIFIC EXTRA CONTROLS ── */}
            {viewerMode === 'Recurrence' && (
                <div className="space-y-3">
                    <ColormapSelector value={colormap} onChange={setColormap} />
                </div>
            )}
            {viewerMode === 'Polar' && (
                <div className="space-y-3">
                    <SliderControl
                        label="Periodicity (samples / 360°)"
                        min={10} max={1000} step={10}
                        value={periodicity} onChange={setPeriodicity}
                        unit=" samp"
                    />
                    <p className="text-xs text-gray-600">
                        One full revolution = {periodicity} samples. Adjust to match signal period.
                    </p>
                </div>
            )}
            {(viewerMode === 'Polar' || viewerMode === 'Recurrence') && (
                <section>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Sample Range</h3>
                    {/* All-data toggle */}
                    <div className="flex items-center gap-2 mb-3">
                        <button
                            onClick={() => setAllSamples(v => !v)}
                            className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${allSamples ? 'bg-accent-blue' : 'bg-dark-border'}`}
                        >
                            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${allSamples ? 'left-[18px]' : 'left-0.5'}`} />
                        </button>
                        <span className="text-xs text-gray-300 leading-none">
                            All Data
                            {graphData
                                ? ` — ${Math.min(graphData.traces[chA]?.length || 0, graphData.traces[chB]?.length || 0).toLocaleString()} samp`
                                : ''}
                        </span>
                    </div>
                    {/* Native range slider — fires onInput on every tick */}
                    {!allSamples && (() => {
                        const maxSamp = graphData
                            ? Math.min(graphData.traces[chA]?.length || 10000, graphData.traces[chB]?.length || 10000)
                            : 10000
                        // Clamp displayed value so it never exceeds actual data
                        const clampedVal = Math.min(sampleCount, maxSamp)
                        const pct = ((clampedVal - 100) / (maxSamp - 100)) * 100
                        return (
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs text-gray-500">
                                    <span>Samples</span>
                                    <span className="text-gray-300 font-mono">{clampedVal.toLocaleString()} / {maxSamp.toLocaleString()}</span>
                                </div>
                                <input
                                    type="range"
                                    min={100}
                                    max={maxSamp}
                                    step={Math.max(1, Math.floor(maxSamp / 200))}
                                    value={clampedVal}
                                    onInput={e => setSampleCount(Number(e.target.value))}
                                    onChange={e => setSampleCount(Number(e.target.value))}
                                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                                    style={{ accentColor: '#4f8ef7', background: `linear-gradient(to right, #4f8ef7 ${pct}%, #2e3350 ${pct}%)` }}
                                />
                                <div className="flex justify-between text-xs text-gray-600">
                                    <span>100</span>
                                    <span>{maxSamp.toLocaleString()}</span>
                                </div>
                            </div>
                        )
                    })()}
                </section>
            )}
            {viewerMode === 'XOR' && (
                <div className="space-y-3">
                    <SliderControl label="Chunk Size" min={16} max={256} step={16} value={chunkSize} onChange={setChunkSize} />
                </div>
            )}

            {/* ── AI/ML reports: Continuous only ── */}
            {viewerMode === 'Continuous' && (
                <>
                    <StatCard title={signalType === 'eeg' ? 'CNN Report' : 'AI Report'} className="mb-3">
                        {aiReport ? (
                            <div className="text-xs">
                                <span className={`px-2 py-0.5 rounded-full font-bold ${
                                    signalType === 'eeg'
                                        ? 'bg-purple-500/20 text-purple-300'
                                        : aiReport.prediction === 'NORM'
                                            ? 'bg-accent-green/20 text-accent-green'
                                            : 'bg-red-500/20 text-red-400'
                                }`}>
                                    {signalType === 'eeg'
                                        ? resolveLabel(aiReport.class ?? aiReport.prediction, 'eeg')
                                        : (aiReport.prediction ?? resolveLabel(aiReport.class, 'ecg'))
                                    }
                                </span>
                                <p className="mt-2 text-gray-400">
                                    Confidence: {aiReport.confidence > 2
                                        ? aiReport.confidence.toFixed(1)
                                        : (aiReport.confidence * 100).toFixed(1)}%
                                </p>
                                {signalType === 'eeg' && aiReport.window_agree !== undefined && (
                                    <p className="mt-1 text-gray-500">Window agree: {(aiReport.window_agree * 100).toFixed(0)}%</p>
                                )}
                            </div>
                        ) : <p className="text-xs text-gray-500 italic">No File Uploaded</p>}
                    </StatCard>
                    <StatCard title={signalType === 'eeg' ? 'SVM Report' : 'Classic ML (RF)'}>
                        {mlReport ? (
                            <div className="text-xs">
                                <span className={`px-2 py-0.5 rounded-full font-bold ${
                                    signalType === 'eeg' ? 'bg-purple-500/20 text-purple-300' : 'bg-accent-blue/20 text-accent-blue'
                                }`}>
                                    {signalType === 'eeg'
                                        ? resolveLabel(mlReport.class ?? mlReport.prediction, 'eeg')
                                        : resolveLabel(mlReport.prediction, 'ecg')
                                    }
                                </span>
                                {mlReport.confidence !== undefined && (
                                    <p className="mt-2 text-gray-400">
                                        Confidence: {mlReport.confidence > 2
                                            ? mlReport.confidence.toFixed(1)
                                            : (mlReport.confidence * 100).toFixed(1)}%
                                    </p>
                                )}
                            </div>
                        ) : <p className="text-xs text-gray-500 italic">Waiting...</p>}
                    </StatCard>
                </>
            )}

            {/* ── Polar statistics ── */}
            {viewerMode === 'Polar' && (() => {
                if (!graphData || !graphData.traces[chA] || !graphData.traces[chB]) {
                    return <StatCard title="Polar Stats"><p className="text-xs text-gray-500 italic">No data loaded</p></StatCard>
                }
                const totalN = Math.min(graphData.traces[chA].length, graphData.traces[chB].length)
                const n = allSamples ? totalN : Math.min(sampleCount, totalN)
                const sigA = graphData.traces[chA].slice(0, n)
                const sigB = graphData.traces[chB].slice(0, n)
                const rRaw = sigA.map((v, i) => Math.abs(v) / (Math.abs(sigB[i]) + 1e-6))
                const sorted = [...rRaw].sort((a, b) => a - b)
                const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1
                const rNorm = rRaw.map(v => Math.min(v, p95) / p95)
                const mean = rNorm.reduce((s, v) => s + v, 0) / rNorm.length
                const std = Math.sqrt(rNorm.reduce((s, v) => s + (v - mean) ** 2, 0) / rNorm.length)
                const revolutions = Math.floor(n / periodicity)
                const chALabel = channels[chA]?.label || `CH${chA+1}`
                const chBLabel = channels[chB]?.label || `CH${chB+1}`
                return (
                    <StatCard title="Polar Stats">
                        <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between"><span className="text-gray-500">Channels</span><span className="text-gray-200 font-mono">{chALabel} / {chBLabel}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Samples (n)</span><span className="text-gray-200 font-mono">{n.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Revolutions</span><span className="text-gray-200 font-mono">{revolutions}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">r mean (norm)</span><span className="text-gray-200 font-mono">{mean.toFixed(3)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">r std (norm)</span><span className="text-gray-200 font-mono">{std.toFixed(3)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">r p95 (raw)</span><span className="text-gray-200 font-mono">{p95.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Period</span><span className="text-gray-200 font-mono">{periodicity} samp</span></div>
                        </div>
                    </StatCard>
                )
            })()}

            {/* ── Recurrence / Trajectory statistics ── */}
            {viewerMode === 'Recurrence' && (() => {
                if (!graphData || !graphData.traces[chA] || !graphData.traces[chB]) {
                    return <StatCard title="Trajectory Stats"><p className="text-xs text-gray-500 italic">No data loaded</p></StatCard>
                }
                const totalN = Math.min(graphData.traces[chA].length, graphData.traces[chB].length)
                const n = allSamples ? totalN : Math.min(sampleCount, totalN)
                const sigA = graphData.traces[chA].slice(0, n)
                const sigB = graphData.traces[chB].slice(0, n)
                const chALabel = channels[chA]?.label || `CH${chA+1}`
                const chBLabel = channels[chB]?.label || `CH${chB+1}`
                const meanA = sigA.reduce((s,v) => s+v, 0) / n
                const meanB = sigB.reduce((s,v) => s+v, 0) / n
                const stdA = Math.sqrt(sigA.reduce((s,v) => s+(v-meanA)**2, 0) / n)
                const stdB = Math.sqrt(sigB.reduce((s,v) => s+(v-meanB)**2, 0) / n)
                let minA = sigA[0], maxA = sigA[0]; for (const v of sigA) { if (v < minA) minA = v; if (v > maxA) maxA = v }
                let minB = sigB[0], maxB = sigB[0]; for (const v of sigB) { if (v < minB) minB = v; if (v > maxB) maxB = v }
                // Path length (Euclidean sum of steps)
                let pathLen = 0
                for (let i = 1; i < n; i++) pathLen += Math.sqrt((sigA[i]-sigA[i-1])**2 + (sigB[i]-sigB[i-1])**2)
                // Cross-correlation at lag 0
                const cov = sigA.reduce((s,v,i) => s + (v-meanA)*(sigB[i]-meanB), 0) / n
                const corr = stdA * stdB > 0 ? cov / (stdA * stdB) : 0
                return (
                    <StatCard title="Trajectory Stats">
                        <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between"><span className="text-gray-500">Channels</span><span className="text-gray-200 font-mono">{chALabel} / {chBLabel}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Samples (n)</span><span className="text-gray-200 font-mono">{n.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Correlation</span><span className={`font-mono font-bold ${Math.abs(corr) > 0.7 ? 'text-accent-green' : Math.abs(corr) > 0.4 ? 'text-f59e0b' : 'text-gray-300'}`}>{corr.toFixed(3)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Path length</span><span className="text-gray-200 font-mono">{pathLen.toFixed(1)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">{chALabel} mean±std</span><span className="text-gray-200 font-mono">{meanA.toFixed(2)}±{stdA.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">{chBLabel} mean±std</span><span className="text-gray-200 font-mono">{meanB.toFixed(2)}±{stdB.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">{chALabel} range</span><span className="text-gray-200 font-mono">[{minA.toFixed(1)}, {maxA.toFixed(1)}]</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">{chBLabel} range</span><span className="text-gray-200 font-mono">[{minB.toFixed(1)}, {maxB.toFixed(1)}]</span></div>
                        </div>
                    </StatCard>
                )
            })()}

        </div>
    )

    return (
        <div className="flex min-h-screen bg-dark-bg">
            <Sidebar>{sidebarContent}</Sidebar>
            <main className="ml-[260px] flex-1 p-6 overflow-y-auto min-h-screen">
                <h1 className="text-2xl font-bold text-white mb-1">Medical Signal Viewer</h1>
                <p className="text-sm text-gray-400 mb-6">Supporting ECG and EEG Analysis</p>

                {viewerMode === 'Continuous' && (
                    <div className="space-y-4">
                        {!graphData && (
                            <div className="bg-dark-card rounded-xl border border-dark-border p-12 text-center text-gray-500 border-dashed">
                                Upload a file to begin visualization
                            </div>
                        )}
                        {graphData && displayMode === 'Multi-Panel' && channels.map((ch) => (
                            ch.visible && (
                                <div key={ch.id} className="bg-dark-card rounded-xl border border-dark-border p-3 shadow-lg">
                                    <div ref={el => continuousRefs.current[ch.id] = el} />
                                </div>
                            )
                        ))}
                        {graphData && displayMode === 'Overlay' && (
                            <div className="bg-dark-card rounded-xl border border-dark-border p-3 shadow-lg">
                                <div ref={overlayRef} />
                            </div>
                        )}
                    </div>
                )}

                {viewerMode === 'XOR' && (
                    <div className="bg-dark-card rounded-xl border border-dark-border p-3 shadow-lg">
                        {!graphData && (
                            <div className="p-12 text-center text-gray-500 italic">
                                Upload a file then select two channels to compute their XOR
                            </div>
                        )}
                        <div ref={xorRef} />
                    </div>
                )}

                {viewerMode === 'Polar' && (
                    <div className="bg-dark-card rounded-xl border border-dark-border p-3 shadow-lg">
                        {!graphData && (
                            <div className="p-6 text-center text-gray-500 italic text-xs">
                                Upload a file to view the polar periodicity plot
                            </div>
                        )}
                        <div ref={polarRef} />
                    </div>
                )}

                {viewerMode === 'Recurrence' && (
                    <div className="bg-dark-card rounded-xl border border-dark-border p-3 shadow-lg">
                        {!graphData && (
                            <div className="p-6 text-center text-gray-500 italic text-xs">
                                Upload a file to view the trajectory plot
                            </div>
                        )}
                        <div ref={recurrenceRef} />
                    </div>
                )}
            </main>
        </div>
    )
}
