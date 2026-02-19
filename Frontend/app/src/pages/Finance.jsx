import { useState, useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import Sidebar from '../components/Sidebar'
import ToggleTabs from '../components/ui/ToggleTabs'
import SliderControl from '../components/ui/SliderControl'
import StatCard from '../components/ui/StatCard'

const DARK_LAYOUT = {
    paper_bgcolor: '#21263a',
    plot_bgcolor: '#21263a',
    font: { color: '#cbd5e1', family: 'Inter' },
    margin: { t: 30, r: 20, b: 40, l: 50 },
    xaxis: { gridcolor: '#2e3350', zerolinecolor: '#2e3350' },
    yaxis: { gridcolor: '#2e3350', zerolinecolor: '#2e3350' },
}

const ASSETS = {
    Stocks: ['AAPL', 'TSLA', 'GOOGL'],
    Currencies: ['USD/EGP', 'EUR/USD'],
    Minerals: ['Gold', 'Silver', 'Oil'],
}

function generateOHLC(days = 60) {
    let open = 150 + Math.random() * 50
    const data = { date: [], open: [], high: [], low: [], close: [], volume: [] }
    const now = new Date()
    for (let i = 0; i < days; i++) {
        const d = new Date(now)
        d.setDate(d.getDate() - (days - i))
        data.date.push(d.toISOString().split('T')[0])
        const change = (Math.random() - 0.48) * 5
        const close = open + change
        const high = Math.max(open, close) + Math.random() * 3
        const low = Math.min(open, close) - Math.random() * 3
        data.open.push(+open.toFixed(2))
        data.high.push(+high.toFixed(2))
        data.low.push(+low.toFixed(2))
        data.close.push(+close.toFixed(2))
        data.volume.push(Math.floor(Math.random() * 5000000 + 1000000))
        open = close
    }
    return data
}

function calcSMA(data, period) {
    return data.map((_, i, arr) => {
        if (i < period - 1) return null
        const slice = arr.slice(i - period + 1, i + 1)
        return slice.reduce((a, b) => a + b, 0) / period
    })
}

export default function Finance() {
    const [category, setCategory] = useState('Stocks')
    const [asset, setAsset] = useState('AAPL')
    const [chartType, setChartType] = useState('Candlestick')
    const [forecastDays, setForecastDays] = useState(30)
    const [showSMA20, setShowSMA20] = useState(true)
    const [showSMA50, setShowSMA50] = useState(false)
    const [dateFrom, setDateFrom] = useState('2025-12-01')
    const [dateTo, setDateTo] = useState('2026-02-15')

    const mainChartRef = useRef(null)
    const volumeRef = useRef(null)
    const forecastRef = useRef(null)
    const ohlcData = useRef(generateOHLC(60))

    useEffect(() => {
        ohlcData.current = generateOHLC(60)
    }, [asset, category])

    // Main chart
    useEffect(() => {
        if (!mainChartRef.current) return
        const d = ohlcData.current
        const traces = []

        if (chartType === 'Candlestick') {
            traces.push({
                x: d.date, open: d.open, high: d.high, low: d.low, close: d.close,
                type: 'candlestick',
                increasing: { line: { color: '#22d3a5' }, fillcolor: '#22d3a5' },
                decreasing: { line: { color: '#ef4444' }, fillcolor: '#ef4444' },
            })
        } else {
            traces.push({
                x: d.date, y: d.close,
                type: 'scatter', mode: 'lines',
                line: { color: '#4f8ef7', width: 2 },
                fill: 'tozeroy', fillcolor: 'rgba(79,142,247,0.08)',
                name: 'Close',
            })
        }

        if (showSMA20) {
            const sma20 = calcSMA(d.close, 20)
            traces.push({
                x: d.date, y: sma20,
                type: 'scatter', mode: 'lines',
                line: { color: '#f59e0b', width: 1.5, dash: 'dot' },
                name: 'SMA 20',
            })
        }
        if (showSMA50) {
            const sma50 = calcSMA(d.close, Math.min(50, d.close.length))
            traces.push({
                x: d.date, y: sma50,
                type: 'scatter', mode: 'lines',
                line: { color: '#a78bfa', width: 1.5, dash: 'dot' },
                name: 'SMA 50',
            })
        }

        Plotly.react(mainChartRef.current, traces, {
            ...DARK_LAYOUT,
            height: 380,
            xaxis: { ...DARK_LAYOUT.xaxis, rangeslider: { visible: false } },
            legend: { font: { color: '#cbd5e1' }, bgcolor: 'transparent', x: 0, y: 1.15, orientation: 'h' },
        }, { responsive: true, displayModeBar: false })
    }, [chartType, showSMA20, showSMA50, asset, category])

    // Volume chart
    useEffect(() => {
        if (!volumeRef.current) return
        const d = ohlcData.current
        const colors = d.close.map((c, i) => (i > 0 && c >= d.close[i - 1]) ? '#22d3a5' : '#ef4444')
        Plotly.react(volumeRef.current, [{
            x: d.date, y: d.volume,
            type: 'bar',
            marker: { color: colors, opacity: 0.7 },
        }], {
            ...DARK_LAYOUT,
            height: 150,
            xaxis: { ...DARK_LAYOUT.xaxis },
            yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'Volume', font: { color: '#94a3b8', size: 10 } } },
        }, { responsive: true, displayModeBar: false })
    }, [asset, category])

    // Forecast chart
    useEffect(() => {
        if (!forecastRef.current) return
        const d = ohlcData.current
        const histX = d.date
        const histY = d.close

        const forecastX = []
        const forecastY = []
        const upper = []
        const lower = []
        const lastDate = new Date(d.date[d.date.length - 1])
        let lastPrice = d.close[d.close.length - 1]

        for (let i = 1; i <= forecastDays; i++) {
            const nd = new Date(lastDate)
            nd.setDate(nd.getDate() + i)
            forecastX.push(nd.toISOString().split('T')[0])
            lastPrice += (Math.random() - 0.45) * 2
            forecastY.push(+lastPrice.toFixed(2))
            upper.push(+(lastPrice + i * 0.3).toFixed(2))
            lower.push(+(lastPrice - i * 0.3).toFixed(2))
        }

        Plotly.react(forecastRef.current, [
            { x: histX, y: histY, type: 'scatter', mode: 'lines', line: { color: '#4f8ef7', width: 2 }, name: 'Historical' },
            { x: forecastX, y: forecastY, type: 'scatter', mode: 'lines', line: { color: '#22d3a5', width: 2, dash: 'dash' }, name: 'Forecast' },
            { x: forecastX, y: upper, type: 'scatter', mode: 'lines', line: { width: 0 }, showlegend: false },
            { x: forecastX, y: lower, type: 'scatter', mode: 'lines', line: { width: 0 }, fill: 'tonexty', fillcolor: 'rgba(34,211,165,0.1)', showlegend: false },
        ], {
            ...DARK_LAYOUT,
            height: 300,
            legend: { font: { color: '#cbd5e1' }, bgcolor: 'transparent', x: 0, y: 1.15, orientation: 'h' },
        }, { responsive: true, displayModeBar: false })
    }, [forecastDays, asset, category])

    const currentPrice = ohlcData.current.close[ohlcData.current.close.length - 1]
    const prevPrice = ohlcData.current.close[ohlcData.current.close.length - 8] || currentPrice
    const change7d = (((currentPrice - prevPrice) / prevPrice) * 100).toFixed(2)

    const sidebarContent = (
        <>
            <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Category</h3>
                <ToggleTabs tabs={['Stocks', 'Currencies', 'Minerals']} active={category} onChange={(c) => { setCategory(c); setAsset(ASSETS[c][0]) }} />
            </div>

            <div className="mb-4">
                <label className="text-xs font-medium text-gray-400">Asset</label>
                <select value={asset} onChange={(e) => setAsset(e.target.value)}
                    className="w-full mt-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-accent-blue">
                    {ASSETS[category].map((a) => <option key={a}>{a}</option>)}
                </select>
            </div>

            <div className="mb-4 space-y-2">
                <div>
                    <label className="text-xs font-medium text-gray-400">From</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full mt-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-accent-blue" />
                </div>
                <div>
                    <label className="text-xs font-medium text-gray-400">To</label>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                        className="w-full mt-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-accent-blue" />
                </div>
            </div>

            <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Chart Type</h3>
                <ToggleTabs tabs={['Candlestick', 'Line']} active={chartType} onChange={setChartType} />
            </div>

            <div className="mb-4">
                <SliderControl label="Forecast Horizon" min={7} max={90} step={1} value={forecastDays} onChange={setForecastDays} unit=" days" />
            </div>

            <button className="w-full mb-4 bg-accent-blue hover:bg-accent-blue/80 text-white text-xs font-semibold py-2 rounded-lg transition-colors">
                Fetch & Predict
            </button>

            <StatCard title="Market Stats">
                <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                        <span className="text-gray-400">Current Price</span>
                        <span className="text-white font-semibold">${currentPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">7d Change</span>
                        <span className={`font-semibold ${change7d >= 0 ? 'text-accent-green' : 'text-red-400'}`}>{change7d >= 0 ? '+' : ''}{change7d}%</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Trend</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent-green/20 text-accent-green border border-accent-green/30">
                            {change7d >= 0 ? '↑ Bullish' : '↓ Bearish'}
                        </span>
                    </div>
                </div>
            </StatCard>
        </>
    )

    return (
        <div className="flex min-h-screen bg-dark-bg">
            <Sidebar>{sidebarContent}</Sidebar>
            <main className="ml-[260px] flex-1 p-6 overflow-y-auto min-h-screen">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-1">Finance Signal Viewer</h1>
                        <p className="text-sm text-gray-400">{asset} — {category}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                            <input type="checkbox" checked={showSMA20} onChange={() => setShowSMA20(!showSMA20)} className="accent-amber-500" />
                            <span className="text-amber-400">SMA 20</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                            <input type="checkbox" checked={showSMA50} onChange={() => setShowSMA50(!showSMA50)} className="accent-violet-500" />
                            <span className="text-violet-400">SMA 50</span>
                        </label>
                    </div>
                </div>

                {/* Main chart */}
                <div className="bg-dark-card rounded-xl border border-dark-border p-3 mb-4">
                    <div ref={mainChartRef} />
                </div>

                {/* Volume */}
                <div className="bg-dark-card rounded-xl border border-dark-border p-3 mb-4">
                    <div ref={volumeRef} />
                </div>

                {/* Forecast */}
                <div className="bg-dark-card rounded-xl border border-dark-border p-3 mb-4">
                    <h3 className="text-sm font-semibold text-gray-300 mb-2">Forecast — {forecastDays} Day Horizon</h3>
                    <div ref={forecastRef} />
                    <div className="flex gap-3 mt-3">
                        <div className="flex-1 bg-dark-bg rounded-lg p-2 text-center border border-dark-border">
                            <p className="text-[10px] text-gray-500 uppercase font-semibold">MAE</p>
                            <p className="text-sm text-accent-blue font-bold">2.34</p>
                        </div>
                        <div className="flex-1 bg-dark-bg rounded-lg p-2 text-center border border-dark-border">
                            <p className="text-[10px] text-gray-500 uppercase font-semibold">RMSE</p>
                            <p className="text-sm text-accent-green font-bold">3.17</p>
                        </div>
                        <div className="flex-1 bg-dark-bg rounded-lg p-2 text-center border border-dark-border">
                            <p className="text-[10px] text-gray-500 uppercase font-semibold">MAPE</p>
                            <p className="text-sm text-amber-400 font-bold">1.8%</p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
