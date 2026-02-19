import { useState, useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import Sidebar from '../components/Sidebar'
import ToggleTabs from '../components/ui/ToggleTabs'
import SliderControl from '../components/ui/SliderControl'
import FileUpload from '../components/ui/FileUpload'
import StatCard from '../components/ui/StatCard'

const DARK_LAYOUT = {
    paper_bgcolor: '#21263a',
    plot_bgcolor: '#21263a',
    font: { color: '#cbd5e1', family: 'Inter' },
    margin: { t: 30, r: 20, b: 40, l: 50 },
    xaxis: { gridcolor: '#2e3350', zerolinecolor: '#2e3350' },
    yaxis: { gridcolor: '#2e3350', zerolinecolor: '#2e3350' },
}

export default function Acoustic() {
    const [tab, setTab] = useState('Doppler')
    const [hornFreq, setHornFreq] = useState(440)
    const [carVelocity, setCarVelocity] = useState(30)

    const dopplerChartRef = useRef(null)
    const mfccRef = useRef(null)

    // Doppler chart
    useEffect(() => {
        if (tab !== 'Doppler' || !dopplerChartRef.current) return
        const c = 343
        const numPoints = 200
        const x = Array.from({ length: numPoints }, (_, i) => -5 + i * (10 / numPoints))
        const y = x.map((t) => {
            const v = carVelocity
            if (t < 0) return hornFreq * (c / (c - v))
            if (t > 0) return hornFreq * (c / (c + v))
            return hornFreq
        })
        // Smooth the transition
        const smoothY = y.map((val, i) => {
            if (i < 5 || i > numPoints - 5) return val
            const window = 5
            let sum = 0
            let count = 0
            for (let j = Math.max(0, i - window); j <= Math.min(numPoints - 1, i + window); j++) {
                sum += y[j]; count++
            }
            return sum / count
        })

        Plotly.react(dopplerChartRef.current, [{
            x, y: smoothY,
            type: 'scatter', mode: 'lines',
            line: { color: '#4f8ef7', width: 2.5 },
            fill: 'tozeroy',
            fillcolor: 'rgba(79,142,247,0.1)',
        }], {
            ...DARK_LAYOUT,
            height: 300,
            xaxis: { ...DARK_LAYOUT.xaxis, title: { text: 'Time (s)', font: { color: '#94a3b8' } } },
            yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'Frequency (Hz)', font: { color: '#94a3b8' } } },
        }, { responsive: true, displayModeBar: false })
    }, [tab, hornFreq, carVelocity])

    // MFCC heatmap for drone
    useEffect(() => {
        if (tab !== 'Drone Detection' || !mfccRef.current) return
        const z = Array.from({ length: 13 }, (_, i) =>
            Array.from({ length: 50 }, (_, j) =>
                Math.sin(i * 0.5 + j * 0.1) * 5 + Math.random() * 3
            )
        )
        Plotly.react(mfccRef.current, [{
            z, type: 'heatmap',
            colorscale: 'Viridis', showscale: true,
            colorbar: { tickfont: { color: '#94a3b8' } },
        }], {
            ...DARK_LAYOUT,
            height: 350,
            xaxis: { ...DARK_LAYOUT.xaxis, title: { text: 'Frame', font: { color: '#94a3b8' } } },
            yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'MFCC Coefficient', font: { color: '#94a3b8' } } },
        }, { responsive: true, displayModeBar: false })
    }, [tab])

    const sidebarContent = (
        <>
            <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Mode</h3>
                <ToggleTabs tabs={['Doppler', 'Drone Detection']} active={tab} onChange={setTab} />
            </div>

            {tab === 'Doppler' && (
                <>
                    <div className="mb-4 space-y-3">
                        <SliderControl label="Horn Frequency" min={200} max={2000} step={10} value={hornFreq} onChange={setHornFreq} unit=" Hz" />
                        <SliderControl label="Car Velocity" min={0} max={150} step={1} value={carVelocity} onChange={setCarVelocity} unit=" m/s" />
                        <button className="w-full bg-accent-blue hover:bg-accent-blue/80 text-white text-xs font-semibold py-2 rounded-lg transition-colors">
                            Generate & Play
                        </button>
                    </div>
                    <div className="border-t border-dark-border my-3" />
                    <div className="mb-4">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Upload Audio</h3>
                        <FileUpload accept=".wav,.mp3" label="Drop .wav/.mp3 file" />
                        <button className="w-full mt-2 bg-dark-bg border border-dark-border text-gray-300 text-xs font-semibold py-2 rounded-lg hover:border-accent-blue transition-colors">
                            Estimate Velocity
                        </button>
                    </div>
                    <StatCard title="Estimation Results">
                        <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between"><span className="text-gray-400">Estimated f₀</span><span className="text-white font-semibold">440 Hz</span></div>
                            <div className="flex justify-between"><span className="text-gray-400">Velocity</span><span className="text-accent-blue font-semibold">67 m/s</span></div>
                        </div>
                    </StatCard>
                </>
            )}

            {tab === 'Drone Detection' && (
                <>
                    <div className="mb-4">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Upload Audio</h3>
                        <FileUpload accept=".wav,.mp3" label="Drop audio file" />
                        <button className="w-full mt-2 bg-accent-blue hover:bg-accent-blue/80 text-white text-xs font-semibold py-2 rounded-lg transition-colors">
                            Detect
                        </button>
                    </div>
                    <StatCard title="Detection Results">
                        <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Class</span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">DRONE</span>
                            </div>
                            <div className="flex justify-between"><span className="text-gray-400">Confidence</span><span className="text-accent-green font-semibold">91%</span></div>
                        </div>
                    </StatCard>
                </>
            )}
        </>
    )

    return (
        <div className="flex min-h-screen bg-dark-bg">
            <Sidebar>{sidebarContent}</Sidebar>
            <main className="ml-[260px] flex-1 p-6 overflow-y-auto min-h-screen">
                <h1 className="text-2xl font-bold text-white mb-1">Acoustic Signal Viewer</h1>
                <p className="text-sm text-gray-400 mb-6">
                    {tab === 'Doppler' ? 'Doppler effect simulation and velocity estimation' : 'Drone detection via audio classification'}
                </p>

                {tab === 'Doppler' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Left: Animation + Frequency Chart */}
                        <div className="space-y-4">
                            {/* Animated car SVG */}
                            <div className="bg-dark-card rounded-xl border border-dark-border p-4 h-48 relative overflow-hidden">
                                {/* Road */}
                                <div className="absolute bottom-8 left-0 right-0 h-12 bg-gray-800 rounded">
                                    <div className="absolute top-1/2 left-0 right-0 h-0.5 border-t-2 border-dashed border-yellow-500/40" />
                                </div>
                                {/* Observer */}
                                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center">
                                    <span className="text-2xl">🧍</span>
                                    <span className="text-[10px] text-gray-500 mt-1">Observer</span>
                                </div>
                                {/* Car animation */}
                                <div className="absolute bottom-10 animate-car">
                                    <span className="text-3xl">🚗</span>
                                </div>
                                <style>{`
                  @keyframes carMove { 0% { left: -40px; } 100% { left: calc(100% + 40px); } }
                  .animate-car { animation: carMove ${Math.max(1, 5 - carVelocity / 40)}s linear infinite; }
                `}</style>
                            </div>

                            {/* Frequency chart */}
                            <div className="bg-dark-card rounded-xl border border-dark-border p-3">
                                <div ref={dopplerChartRef} />
                            </div>
                        </div>

                        {/* Right: Spectrogram placeholder */}
                        <div className="bg-dark-card rounded-xl border border-dark-border p-6 flex items-center justify-center min-h-[400px]">
                            <div className="text-center">
                                <div className="text-5xl mb-3 opacity-30">📊</div>
                                <p className="text-gray-500 text-sm font-medium">Spectrogram</p>
                                <p className="text-gray-600 text-xs mt-1">Awaiting audio input</p>
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'Drone Detection' && (
                    <div className="space-y-4">
                        {/* MFCC Heatmap */}
                        <div className="bg-dark-card rounded-xl border border-dark-border p-3">
                            <h3 className="text-sm font-semibold text-gray-300 mb-2">MFCC Features</h3>
                            <div ref={mfccRef} />
                        </div>

                        {/* Spectrogram placeholder + Classification */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="bg-dark-card rounded-xl border border-dark-border p-6 flex items-center justify-center min-h-[250px]">
                                <div className="text-center">
                                    <div className="text-5xl mb-3 opacity-30">📊</div>
                                    <p className="text-gray-500 text-sm font-medium">Spectrogram</p>
                                    <p className="text-gray-600 text-xs mt-1">Awaiting audio input</p>
                                </div>
                            </div>
                            <div className="bg-dark-card rounded-xl border border-dark-border p-6 flex items-center justify-center">
                                <div className="text-center">
                                    <span className="inline-block px-4 py-2 rounded-full text-sm font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 mb-2">
                                        🛸 DRONE DETECTED
                                    </span>
                                    <p className="text-gray-400 text-xs mt-2">Confidence: 91%</p>
                                    <div className="w-32 bg-dark-bg rounded-full h-2 mt-2 mx-auto">
                                        <div className="h-2 rounded-full bg-gradient-to-r from-accent-blue to-accent-green" style={{ width: '91%' }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}
