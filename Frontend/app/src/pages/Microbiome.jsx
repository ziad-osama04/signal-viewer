import { useState, useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import Sidebar from '../components/Sidebar'
import ToggleTabs from '../components/ui/ToggleTabs'
import ColormapSelector from '../components/ui/ColormapSelector'
import StatCard from '../components/ui/StatCard'

const DARK_LAYOUT = {
    paper_bgcolor: '#21263a',
    plot_bgcolor: '#21263a',
    font: { color: '#cbd5e1', family: 'Inter' },
    margin: { t: 30, r: 20, b: 60, l: 60 },
    xaxis: { gridcolor: '#2e3350', zerolinecolor: '#2e3350' },
    yaxis: { gridcolor: '#2e3350', zerolinecolor: '#2e3350' },
}

const TAXA = ['Bacteroidetes', 'Firmicutes', 'Proteobacteria', 'Actinobacteria', 'Verrucomicrobia']
const SAMPLES = Array.from({ length: 10 }, (_, i) => `Sample ${i + 1}`)
const DISEASES = ['Healthy', 'IBD', 'T2D']
const TAXA_COLORS = ['#4f8ef7', '#22d3a5', '#f59e0b', '#ef4444', '#a78bfa']

export default function Microbiome() {
    const [dataset, setDataset] = useState('iHMP')
    const [viewType, setViewType] = useState('Abundance')
    const [diseaseFilter, setDiseaseFilter] = useState({ Healthy: true, IBD: true, T2D: true })
    const [colormap, setColormap] = useState('Viridis')

    const chartRef = useRef(null)

    const toggleDisease = (d) => setDiseaseFilter((prev) => ({ ...prev, [d]: !prev[d] }))

    // Abundance stacked bar
    useEffect(() => {
        if (viewType !== 'Abundance' || !chartRef.current) return
        const traces = TAXA.map((taxon, ti) => ({
            x: SAMPLES,
            y: SAMPLES.map(() => Math.random() * 30 + 5),
            type: 'bar',
            name: taxon,
            marker: { color: TAXA_COLORS[ti] },
        }))
        Plotly.react(chartRef.current, traces, {
            ...DARK_LAYOUT,
            height: 500,
            barmode: 'stack',
            legend: { font: { color: '#cbd5e1' }, bgcolor: 'transparent' },
            xaxis: { ...DARK_LAYOUT.xaxis, title: { text: 'Samples', font: { color: '#94a3b8' } } },
            yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'Relative Abundance (%)', font: { color: '#94a3b8' } } },
        }, { responsive: true, displayModeBar: false })
    }, [viewType, dataset])

    // PCoA scatter
    useEffect(() => {
        if (viewType !== 'PCoA' || !chartRef.current) return
        const traces = DISEASES.filter((d) => diseaseFilter[d]).map((disease, di) => {
            const colors = ['#4f8ef7', '#ef4444', '#f59e0b']
            const cx = [0, 3, -2][di]
            const cy = [0, 2, -3][di]
            return {
                x: Array.from({ length: 15 }, () => cx + (Math.random() - 0.5) * 3),
                y: Array.from({ length: 15 }, () => cy + (Math.random() - 0.5) * 3),
                type: 'scatter', mode: 'markers',
                name: disease,
                marker: { color: colors[di], size: 9, opacity: 0.8, line: { color: 'rgba(255,255,255,0.2)', width: 1 } },
            }
        })
        Plotly.react(chartRef.current, traces, {
            ...DARK_LAYOUT,
            height: 500,
            xaxis: { ...DARK_LAYOUT.xaxis, title: { text: 'PC1 (32.1%)', font: { color: '#94a3b8' } } },
            yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'PC2 (18.7%)', font: { color: '#94a3b8' } } },
            legend: { font: { color: '#cbd5e1' }, bgcolor: 'transparent' },
        }, { responsive: true, displayModeBar: false })
    }, [viewType, diseaseFilter, dataset])

    // Heatmap
    useEffect(() => {
        if (viewType !== 'Heatmap' || !chartRef.current) return
        const heatTaxa = ['Bacteroides', 'Prevotella', 'Ruminococcus', 'Faecalibacterium', 'Bifidobacterium', 'Akkermansia', 'Lactobacillus', 'Clostridium']
        const z = heatTaxa.map(() => SAMPLES.map(() => Math.random() * 100))
        Plotly.react(chartRef.current, [{
            z, x: SAMPLES, y: heatTaxa,
            type: 'heatmap',
            colorscale: colormap, showscale: true,
            colorbar: { tickfont: { color: '#94a3b8' } },
        }], {
            ...DARK_LAYOUT,
            height: 500,
        }, { responsive: true, displayModeBar: false })
    }, [viewType, colormap, dataset])

    // Diversity box plot
    useEffect(() => {
        if (viewType !== 'Diversity' || !chartRef.current) return
        const colors = ['#4f8ef7', '#ef4444', '#f59e0b']
        const traces = DISEASES.filter((d) => diseaseFilter[d]).map((disease, di) => ({
            y: Array.from({ length: 20 }, () => [4.5, 2.8, 3.2][di] + (Math.random() - 0.5) * 2),
            type: 'box',
            name: disease,
            marker: { color: colors[di] },
            boxpoints: 'all',
            jitter: 0.5,
            pointpos: -1.5,
        }))
        Plotly.react(chartRef.current, traces, {
            ...DARK_LAYOUT,
            height: 500,
            yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'Shannon Diversity Index', font: { color: '#94a3b8' } } },
            legend: { font: { color: '#cbd5e1' }, bgcolor: 'transparent' },
        }, { responsive: true, displayModeBar: false })
    }, [viewType, diseaseFilter, dataset])

    const sidebarContent = (
        <>
            <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Dataset</h3>
                <ToggleTabs tabs={['iHMP', 'HMP2']} active={dataset} onChange={setDataset} />
            </div>

            <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">View Type</h3>
                <ToggleTabs tabs={['Abundance', 'PCoA', 'Heatmap', 'Diversity']} active={viewType} onChange={setViewType} />
            </div>

            <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Disease Filter</h3>
                <div className="space-y-1.5">
                    {DISEASES.map((d) => (
                        <label key={d} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={diseaseFilter[d]} onChange={() => toggleDisease(d)}
                                className="accent-accent-blue w-3.5 h-3.5 rounded" />
                            <span className="text-xs text-gray-300">{d}</span>
                        </label>
                    ))}
                </div>
            </div>

            {viewType === 'Heatmap' && (
                <div className="mb-4">
                    <ColormapSelector value={colormap} onChange={setColormap} />
                </div>
            )}

            <button className="w-full mb-4 bg-accent-blue hover:bg-accent-blue/80 text-white text-xs font-semibold py-2 rounded-lg transition-colors">
                Estimate Patient Profile
            </button>

            <StatCard title="Patient Profile">
                <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                        <span className="text-gray-400">Prediction</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">IBD</span>
                    </div>
                    <div>
                        <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                            <span>Confidence</span><span className="text-accent-blue font-semibold">78%</span>
                        </div>
                        <div className="w-full bg-dark-bg rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-gradient-to-r from-accent-blue to-accent-green" style={{ width: '78%' }} />
                        </div>
                    </div>
                    <div>
                        <p className="text-gray-500 text-[10px] uppercase font-semibold mb-1">Top Contributing Taxa</p>
                        <div className="space-y-1">
                            {['Bacteroides fragilis', 'Faecalibacterium', 'Ruminococcus'].map((t, i) => (
                                <div key={t} className="flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: TAXA_COLORS[i] }} />
                                    <span className="text-gray-300 text-[11px]">{t}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </StatCard>
        </>
    )

    const viewLabels = {
        Abundance: 'Relative abundance across samples',
        PCoA: 'Principal Coordinates Analysis',
        Heatmap: 'Taxa abundance heatmap',
        Diversity: 'Shannon diversity index by disease state',
    }

    return (
        <div className="flex min-h-screen bg-dark-bg">
            <Sidebar>{sidebarContent}</Sidebar>
            <main className="ml-[260px] flex-1 p-6 overflow-y-auto min-h-screen">
                <h1 className="text-2xl font-bold text-white mb-1">Microbiome Signal Viewer</h1>
                <p className="text-sm text-gray-400 mb-6">{viewLabels[viewType]} — {dataset}</p>

                <div className="bg-dark-card rounded-xl border border-dark-border p-3">
                    <div ref={chartRef} />
                </div>
            </main>
        </div>
    )
}
