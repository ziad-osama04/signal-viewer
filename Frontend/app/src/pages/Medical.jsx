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
    xaxis: { gridcolor: '#2e3350', zerolinecolor: '#2e3350' },
    yaxis: { gridcolor: '#2e3350', zerolinecolor: '#2e3350' },
}

function generateSineData(ch, numPoints = 500) {
    const x = Array.from({ length: numPoints }, (_, i) => i * 0.01)
    const freq = [1, 2.5, 0.8, 3.2][ch]
    const amp = [1, 0.7, 1.2, 0.5][ch]
    const phase = [0, Math.PI / 3, Math.PI / 6, Math.PI / 2][ch]
    const y = x.map((t) => amp * Math.sin(2 * Math.PI * freq * t + phase) + (Math.random() - 0.5) * 0.1)
    return { x, y }
}

export default function Medical() {
    const [viewerMode, setViewerMode] = useState('Continuous')
    const [displayMode, setDisplayMode] = useState('Multi-Panel')
    const [channels, setChannels] = useState([
        { id: 0, label: 'CH1', visible: true, color: '#4f8ef7', thickness: 2 },
        { id: 1, label: 'CH2', visible: true, color: '#22d3a5', thickness: 2 },
        { id: 2, label: 'CH3', visible: true, color: '#f59e0b', thickness: 2 },
        { id: 3, label: 'CH4', visible: true, color: '#ef4444', thickness: 2 },
    ])
    const [playing, setPlaying] = useState(false)
    const [speed, setSpeed] = useState(1)
    const [chunkSize, setChunkSize] = useState(64)
    const [polarMode, setPolarMode] = useState('Rolling')
    const [channelPair, setChannelPair] = useState('CH1 vs CH2')
    const [colormap, setColormap] = useState('Viridis')

    const continuousRefs = [useRef(null), useRef(null), useRef(null), useRef(null)]
    const overlayRef = useRef(null)
    const polarRef = useRef(null)
    const recurrenceRef = useRef(null)

    // Continuous mode charts
    useEffect(() => {
        if (viewerMode !== 'Continuous') return
        const visibleChannels = channels.filter((c) => c.visible)

        if (displayMode === 'Multi-Panel') {
            visibleChannels.forEach((ch) => {
                const ref = continuousRefs[ch.id]
                if (!ref.current) return
                const data = generateSineData(ch.id)
                Plotly.react(ref.current, [{
                    x: data.x, y: data.y,
                    type: 'scatter', mode: 'lines',
                    line: { color: ch.color, width: ch.thickness },
                    name: ch.label,
                }], {
                    ...DARK_LAYOUT,
                    height: 140,
                    title: { text: ch.label, font: { size: 11, color: '#94a3b8' } },
                    showlegend: false,
                }, { responsive: true, displayModeBar: false })
            })
        } else {
            if (!overlayRef.current) return
            const traces = visibleChannels.map((ch) => {
                const data = generateSineData(ch.id)
                return {
                    x: data.x, y: data.y,
                    type: 'scatter', mode: 'lines',
                    line: { color: ch.color, width: ch.thickness },
                    name: ch.label,
                }
            })
            Plotly.react(overlayRef.current, traces, {
                ...DARK_LAYOUT,
                height: 500,
                legend: { font: { color: '#cbd5e1' }, bgcolor: 'transparent' },
            }, { responsive: true, displayModeBar: false })
        }
    }, [viewerMode, displayMode, channels])

    // Polar mode
    useEffect(() => {
        if (viewerMode !== 'Polar' || !polarRef.current) return
        const r = Array.from({ length: 200 }, (_, i) => 0.5 + i * 0.02 + Math.random() * 0.1)
        const theta = Array.from({ length: 200 }, (_, i) => (i * 5) % 360)
        Plotly.react(polarRef.current, [{
            type: 'scatterpolar', mode: 'lines',
            r, theta,
            line: { color: '#4f8ef7', width: 2 },
        }], {
            ...DARK_LAYOUT,
            height: 520,
            polar: {
                bgcolor: '#21263a',
                radialaxis: { gridcolor: '#2e3350', linecolor: '#2e3350', tickfont: { color: '#64748b' } },
                angularaxis: { gridcolor: '#2e3350', linecolor: '#2e3350', tickfont: { color: '#64748b' } },
            },
            showlegend: false,
        }, { responsive: true, displayModeBar: false })
    }, [viewerMode, polarMode])

    // Recurrence mode
    useEffect(() => {
        if (viewerMode !== 'Recurrence' || !recurrenceRef.current) return
        const size = 50
        const z = Array.from({ length: size }, (_, i) =>
            Array.from({ length: size }, (_, j) => {
                const dist = Math.abs(Math.sin(i * 0.2) - Math.sin(j * 0.2))
                return dist < 0.3 ? 1 : 0
            })
        )
        Plotly.react(recurrenceRef.current, [{
            z, type: 'heatmap',
            colorscale: colormap, showscale: true,
            colorbar: { tickfont: { color: '#94a3b8' } },
        }], {
            ...DARK_LAYOUT,
            height: 520,
            xaxis: { ...DARK_LAYOUT.xaxis, title: { text: 'Time i', font: { color: '#94a3b8' } } },
            yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'Time j', font: { color: '#94a3b8' } } },
        }, { responsive: true, displayModeBar: false })
    }, [viewerMode, colormap, channelPair])

    const toggleChannel = (id) => setChannels((prev) => prev.map((c) => c.id === id ? { ...c, visible: !c.visible } : c))
    const changeColor = (id, color) => setChannels((prev) => prev.map((c) => c.id === id ? { ...c, color } : c))
    const changeThickness = (id, thickness) => setChannels((prev) => prev.map((c) => c.id === id ? { ...c, thickness } : c))

    const sidebarContent = (
        <>
            {/* Signal Input */}
            <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Signal Input</h3>
                <FileUpload accept=".csv,.edf,.txt" label="Drop ECG file or click" />
                <button className="w-full mt-2 bg-accent-blue hover:bg-accent-blue/80 text-white text-xs font-semibold py-2 rounded-lg transition-colors">
                    Analyze
                </button>
            </div>

            {/* Viewer Mode */}
            <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Viewer Mode</h3>
                <ToggleTabs tabs={['Continuous', 'XOR', 'Polar', 'Recurrence']} active={viewerMode} onChange={setViewerMode} />
            </div>

            {/* Display Mode */}
            {viewerMode === 'Continuous' && (
                <div className="mb-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Display Mode</h3>
                    <div className="space-y-1">
                        {['Multi-Panel', 'Overlay'].map((m) => (
                            <label key={m} className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="displayMode" checked={displayMode === m} onChange={() => setDisplayMode(m)}
                                    className="accent-accent-blue" />
                                <span className="text-xs text-gray-300">{m}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {/* Channels */}
            <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Channels</h3>
                <ChannelControl channels={channels} onToggle={toggleChannel} onColorChange={changeColor} onThicknessChange={changeThickness} />
            </div>

            {/* Playback */}
            <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Playback</h3>
                <div className="flex gap-2 mb-2">
                    <button onClick={() => setPlaying(!playing)}
                        className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors ${playing ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-accent-green/20 text-accent-green border border-accent-green/30'}`}>
                        {playing ? '⏹ Stop' : '▶ Play'}
                    </button>
                    <button className="px-3 text-xs bg-dark-bg border border-dark-border rounded-lg text-gray-400 hover:text-white transition-colors">🔍+</button>
                    <button className="px-3 text-xs bg-dark-bg border border-dark-border rounded-lg text-gray-400 hover:text-white transition-colors">🔍−</button>
                </div>
                <SliderControl label="Speed" min={0.25} max={4} step={0.25} value={speed} onChange={setSpeed} unit="×" />
            </div>

            {/* Recurrence mode extras */}
            {viewerMode === 'Recurrence' && (
                <div className="mb-4 space-y-3">
                    <div>
                        <label className="text-xs font-medium text-gray-400">Channel Pair</label>
                        <select value={channelPair} onChange={(e) => setChannelPair(e.target.value)}
                            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-accent-blue mt-1">
                            {['CH1 vs CH2', 'CH1 vs CH3', 'CH1 vs CH4', 'CH2 vs CH3', 'CH2 vs CH4', 'CH3 vs CH4'].map((p) => (
                                <option key={p}>{p}</option>
                            ))}
                        </select>
                    </div>
                    <ColormapSelector value={colormap} onChange={setColormap} />
                </div>
            )}

            {viewerMode === 'Polar' && (
                <div className="mb-4">
                    <ToggleTabs tabs={['Rolling', 'Cumulative']} active={polarMode} onChange={setPolarMode} />
                </div>
            )}

            {viewerMode === 'XOR' && (
                <div className="mb-4 space-y-3">
                    <SliderControl label="Chunk Size" min={16} max={256} step={16} value={chunkSize} onChange={setChunkSize} />
                    <ColormapSelector value={colormap} onChange={setColormap} />
                </div>
            )}

            {/* AI Report */}
            <StatCard title="AI Report" className="mb-3">
                <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                        ABNORMAL
                    </span>
                    <span className="text-xs text-gray-300">Atrial Fibrillation</span>
                </div>
                <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>Confidence</span><span className="text-accent-blue font-semibold">87%</span>
                    </div>
                    <div className="w-full bg-dark-bg rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-gradient-to-r from-accent-blue to-accent-green" style={{ width: '87%' }} />
                    </div>
                </div>
            </StatCard>

            {/* Classic ML Report */}
            <StatCard title="Classic ML Report">
                <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-gray-400">BPM</span><span className="text-white font-semibold">142</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Rhythm</span><span className="text-amber-400 font-semibold">Irregular</span></div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">vs AI Result</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent-green/20 text-accent-green border border-accent-green/30">MATCH</span>
                    </div>
                </div>
            </StatCard>
        </>
    )

    return (
        <div className="flex min-h-screen bg-dark-bg">
            <Sidebar>{sidebarContent}</Sidebar>
            <main className="ml-[260px] flex-1 p-6 overflow-y-auto min-h-screen">
                <h1 className="text-2xl font-bold text-white mb-1">Medical Signal Viewer</h1>
                <p className="text-sm text-gray-400 mb-6">ECG signal analysis and AI-powered anomaly detection</p>

                {viewerMode === 'Continuous' && (
                    <div className="space-y-3">
                        {displayMode === 'Multi-Panel' ? (
                            channels.filter((c) => c.visible).map((ch) => (
                                <div key={ch.id} className="bg-dark-card rounded-xl border border-dark-border p-3">
                                    <div ref={continuousRefs[ch.id]} />
                                </div>
                            ))
                        ) : (
                            <div className="bg-dark-card rounded-xl border border-dark-border p-3">
                                <div ref={overlayRef} />
                            </div>
                        )}
                    </div>
                )}

                {viewerMode === 'XOR' && (
                    <div className="bg-dark-card rounded-xl border border-dark-border p-6 flex items-center justify-center min-h-[500px]">
                        <div className="text-center">
                            <div className="text-6xl mb-4 opacity-30">🔲</div>
                            <p className="text-gray-500 text-sm">XOR Graph Canvas</p>
                            <p className="text-gray-600 text-xs mt-1">Upload a signal and click Analyze to generate</p>
                        </div>
                    </div>
                )}

                {viewerMode === 'Polar' && (
                    <div className="bg-dark-card rounded-xl border border-dark-border p-3">
                        <div ref={polarRef} />
                    </div>
                )}

                {viewerMode === 'Recurrence' && (
                    <div className="bg-dark-card rounded-xl border border-dark-border p-3">
                        <div ref={recurrenceRef} />
                    </div>
                )}
            </main>
        </div>
    )
}
