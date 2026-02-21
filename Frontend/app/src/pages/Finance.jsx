import { useState, useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import Sidebar from '../components/Sidebar'
import ToggleTabs from '../components/ui/ToggleTabs'
import SliderControl from '../components/ui/SliderControl'
import StatCard from '../components/ui/StatCard'
import FileUpload from '../components/ui/FileUpload'

const DARK_LAYOUT = {
    paper_bgcolor: '#21263a',
    plot_bgcolor:  '#21263a',
    font:   { color: '#cbd5e1', family: 'Inter' },
    margin: { t: 30, r: 20, b: 40, l: 60 },
    xaxis:  { gridcolor: '#2e3350', zerolinecolor: '#2e3350' },
    yaxis:  { gridcolor: '#2e3350', zerolinecolor: '#2e3350' },
}

// ── Asset registry — mirrors finance_service.py ─────────────────────────────
const ASSET_REGISTRY = {
    stock: {
        label: '📈 Stocks',
        assets: [
            { name: 'ABTX', horizon: 5,  features: ['Open','High','Low','Close','Volume','Adj Close'] },
            { name: 'AAT',  horizon: 5,  features: ['Open','High','Low','Close','Volume','Adj Close'] },
        ],
    },
    currency: {
        label: '💱 Currencies',
        assets: [
            { name: 'EUR-USD', horizon: 3, features: ['EURUSD_Open','EURUSD_High','EURUSD_Low','EURUSD_Close','GBPUSD_Close','AUDUSD_Close','NZDUSD_Close','EURGBP_Close','EURJPY_Close_x'] },
            { name: 'USD-JPY', horizon: 3, features: ['USDJPY_Open','USDJPY_High','USDJPY_Low','USDJPY_Close','EURJPY_Close_x','GBPJPY_Close','USDCNY_Close','USDSGD_Close','USDHKD_Close'] },
        ],
    },
    metal: {
        label: '🪙 Metals',
        assets: [
            { name: 'Gold',   horizon: 30, features: ['price'] },
            { name: 'Silver', horizon: 30, features: ['price'] },
        ],
    },
}

const CATEGORY_KEYS = Object.keys(ASSET_REGISTRY)

// ── SMA helper ──────────────────────────────────────────────────────────────
function calcSMA(data, period) {
    return data.map((_, i, arr) => {
        if (i < period - 1) return null
        return arr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
    })
}

// ── Colour badge for metric quality ─────────────────────────────────────────
function metricColor(mape) {
    if (mape < 2)  return 'text-accent-green'
    if (mape < 5)  return 'text-amber-400'
    return 'text-red-400'
}

export default function Finance() {
    // ── Selection state ──────────────────────────────────────────────────────
    const [category,   setCategory]   = useState('stock')
    const [assetName,  setAssetName]  = useState('ABTX')
    const [chartType,  setChartType]  = useState('Line')
    const [showSMA20,  setShowSMA20]  = useState(true)
    const [showSMA50,  setShowSMA50]  = useState(false)
    const [forecastSlice, setForecastSlice] = useState(null)  // null = show all

    // ── Upload & analysis state ──────────────────────────────────────────────
    const [uploadedFile, setUploadedFile] = useState(null)
    const [loading,      setLoading]      = useState(false)
    const [result,       setResult]       = useState(null)   // API response
    const [error,        setError]        = useState(null)

    // ── Refs for Plotly charts ───────────────────────────────────────────────
    const mainChartRef   = useRef(null)
    const volumeRef      = useRef(null)
    const forecastRef    = useRef(null)

    // Derived
    const currentCategory  = ASSET_REGISTRY[category]
    const currentAssetCfg  = currentCategory.assets.find(a => a.name === assetName)
                          || currentCategory.assets[0]

    // When category changes, reset to first asset
    const handleCategoryChange = (cat) => {
        setCategory(cat)
        setAssetName(ASSET_REGISTRY[cat].assets[0].name)
        setResult(null)
        setError(null)
        setUploadedFile(null)
        setForecastSlice(null)
        if (cat === 'metal') setChartType('Line')
    }

    // ── Send for analysis ────────────────────────────────────────────────────
    const handleAnalyze = async () => {
        if (!uploadedFile) { alert('Please upload a CSV file first.'); return }
        setLoading(true)
        setError(null)
        setResult(null)
        try {
            const form = new FormData()
            form.append('file',       uploadedFile)
            form.append('asset_name', assetName)
            form.append('category',   category)
            const res  = await fetch('http://127.0.0.1:8000/api/finance/process', { method: 'POST', body: form })
            const data = await res.json()
            if (data.error) { setError(data.details || data.error); return }
            setResult(data)
        } catch (e) {
            setError(`Request failed: ${e.message}`)
        } finally {
            setLoading(false)
        }
    }

    // ── Main history chart ───────────────────────────────────────────────────
    useEffect(() => {
        if (!mainChartRef.current) return
        if (!result) {
            Plotly.react(mainChartRef.current, [{
                x: [], y: [], type: 'scatter', mode: 'lines',
                line: { color: '#4f8ef7', width: 2 },
                name: 'Upload a CSV and click Analyse',
            }], {
                ...DARK_LAYOUT, height: 340,
                title: { text: 'Historical Price — upload to view', font: { color: '#94a3b8', size: 12 } },
            }, { responsive: true, displayModeBar: false })
            return
        }

        const dates  = result.history.dates
        const prices = result.history.actual
        const traces = []

        const hasOHLC = result.history.open && result.history.high && result.history.low && result.history.close
        if (chartType === 'Candlestick' && hasOHLC) {
            traces.push({
                x: dates,
                open:  result.history.open,
                high:  result.history.high,
                low:   result.history.low,
                close: result.history.close,
                type: 'candlestick',
                increasing: { line: { color: '#22d3a5' }, fillcolor: '#22d3a5' },
                decreasing: { line: { color: '#ef4444' }, fillcolor: '#ef4444' },
                name: assetName,
            })
        } else {
            // Fallback to line if candlestick data not available
            if (chartType === 'Candlestick' && !hasOHLC) {
                console.warn('Candlestick requested but OHLC data missing — falling back to Line')
            }
            traces.push({
                x: dates, y: prices,
                type: 'scatter', mode: 'lines',
                line: { color: '#4f8ef7', width: 2 },
                fill: 'tozeroy', fillcolor: 'rgba(79,142,247,0.06)',
                name: assetName,
            })
        }

        if (showSMA20 && prices.length >= 20) {
            traces.push({
                x: dates, y: calcSMA(prices, 20),
                type: 'scatter', mode: 'lines',
                line: { color: '#f59e0b', width: 1.5, dash: 'dot' },
                name: 'SMA 20',
            })
        }
        if (showSMA50 && prices.length >= 50) {
            traces.push({
                x: dates, y: calcSMA(prices, 50),
                type: 'scatter', mode: 'lines',
                line: { color: '#a78bfa', width: 1.5, dash: 'dot' },
                name: 'SMA 50',
            })
        }

        Plotly.react(mainChartRef.current, traces, {
            ...DARK_LAYOUT, height: 340,
            xaxis: { ...DARK_LAYOUT.xaxis, rangeslider: { visible: false } },
            legend: { font: { color: '#cbd5e1' }, bgcolor: 'transparent', x: 0, y: 1.12, orientation: 'h' },
            title: { text: `${assetName} — Historical Price`, font: { color: '#cbd5e1', size: 13 } },
        }, { responsive: true, displayModeBar: false })
    }, [result, chartType, showSMA20, showSMA50, assetName])

    // ── Volume chart (stocks only — use Volume column if available) ───────────
    useEffect(() => {
        if (!volumeRef.current) return
        if (!result || !result.history.volume) {
            Plotly.react(volumeRef.current, [], {
                ...DARK_LAYOUT, height: 130,
                title: { text: 'Volume (stocks only)', font: { color: '#475569', size: 11 } },
                annotations: [{
                    text: 'Volume not available for this asset',
                    x: 0.5, y: 0.5, xref: 'paper', yref: 'paper',
                    showarrow: false, font: { color: '#475569', size: 12 },
                }],
            }, { responsive: true, displayModeBar: false })
            return
        }
        const dates  = result.history.dates
        const vols   = result.history.volume
        const prices = result.history.actual
        const colors = prices.map((c, i) => (i > 0 && c >= prices[i-1]) ? '#22d3a5' : '#ef4444')
        Plotly.react(volumeRef.current, [{
            x: dates, y: vols, type: 'bar',
            marker: { color: colors, opacity: 0.7 }, name: 'Volume',
        }], {
            ...DARK_LAYOUT, height: 130,
            yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'Volume', font: { color: '#94a3b8', size: 10 } } },
        }, { responsive: true, displayModeBar: false })
    }, [result])

    // ── Forecast chart ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!forecastRef.current) return
        if (!result) {
            Plotly.react(forecastRef.current, [{
                x: [], y: [], type: 'scatter', mode: 'lines',
                line: { color: '#22d3a5', width: 2, dash: 'dash' },
                name: 'Forecast will appear here',
            }], {
                ...DARK_LAYOUT, height: 280,
                title: { text: 'GRU Forecast — run analysis to populate', font: { color: '#94a3b8', size: 12 } },
            }, { responsive: true, displayModeBar: false })
            return
        }

        const histDates  = result.history.dates.slice(-60)
        const histPrices = result.history.actual.slice(-60)
        const maxSlice   = result.forecast.dates.length
        const sliceN     = forecastSlice !== null ? Math.min(forecastSlice, maxSlice) : maxSlice
        const fDates     = result.forecast.dates.slice(0, sliceN)
        const fPrices    = result.forecast.prices.slice(0, sliceN)

        // Confidence band: ±2% expanding per step
        const upper = fPrices.map((p, i) => +(p * (1 + (i + 1) * 0.005)).toFixed(4))
        const lower = fPrices.map((p, i) => +(p * (1 - (i + 1) * 0.005)).toFixed(4))

        Plotly.react(forecastRef.current, [
            {
                x: histDates, y: histPrices,
                type: 'scatter', mode: 'lines',
                line: { color: '#4f8ef7', width: 2 }, name: 'Historical',
            },
            {
                x: fDates, y: fPrices,
                type: 'scatter', mode: 'lines+markers',
                line: { color: '#22d3a5', width: 2.5, dash: 'dash' },
                marker: { size: 6, color: '#22d3a5' }, name: `Forecast (${result.horizon}d)`,
            },
            {
                x: fDates, y: upper,
                type: 'scatter', mode: 'lines',
                line: { width: 0 }, showlegend: false, name: 'Upper',
            },
            {
                x: fDates, y: lower,
                type: 'scatter', mode: 'lines',
                line: { width: 0 },
                fill: 'tonexty', fillcolor: 'rgba(34,211,165,0.12)',
                showlegend: false, name: 'Lower',
            },
        ], {
            ...DARK_LAYOUT, height: 280,
            title: { text: `${assetName} — GRU Forecast (${result.horizon} days ahead)`, font: { color: '#cbd5e1', size: 13 } },
            legend: { font: { color: '#cbd5e1' }, bgcolor: 'transparent', x: 0, y: 1.12, orientation: 'h' },
        }, { responsive: true, displayModeBar: false })
    }, [result, assetName, forecastSlice])

    // ── Derived stats ────────────────────────────────────────────────────────
    const lastPrice     = result ? result.history.actual[result.history.actual.length - 1] : null
    const maxHorizon    = result ? result.forecast.prices.length : 0
    const sliceN        = forecastSlice !== null ? Math.min(forecastSlice, maxHorizon) : maxHorizon
    const firstForecast = result ? result.forecast.prices[0] : null
    const lastForecast  = result ? result.forecast.prices[sliceN - 1] : null
    const forecastChange = (lastPrice && lastForecast)
        ? (((lastForecast - lastPrice) / lastPrice) * 100).toFixed(2)
        : null

    // ── Sidebar ──────────────────────────────────────────────────────────────
    const sidebarContent = (
        <div className="flex flex-col gap-4">

            {/* Category */}
            <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Category</h3>
                <div className="flex flex-col gap-1">
                    {CATEGORY_KEYS.map(cat => (
                        <button
                            key={cat}
                            onClick={() => handleCategoryChange(cat)}
                            className={`text-xs py-1.5 px-3 rounded-lg font-semibold text-left transition-colors border ${
                                category === cat
                                    ? 'bg-accent-blue/20 border-accent-blue text-accent-blue'
                                    : 'bg-dark-bg border-dark-border text-gray-500 hover:text-gray-300'
                            }`}
                        >{ASSET_REGISTRY[cat].label}</button>
                    ))}
                </div>
            </section>

            {/* Asset */}
            <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Asset</h3>
                <div className="flex flex-col gap-1">
                    {currentCategory.assets.map(a => (
                        <button
                            key={a.name}
                            onClick={() => { setAssetName(a.name); setResult(null); setError(null); setForecastSlice(null) }}
                            className={`text-xs py-1.5 px-3 rounded-lg font-mono font-semibold text-left transition-colors border ${
                                assetName === a.name
                                    ? 'bg-accent-green/20 border-accent-green text-accent-green'
                                    : 'bg-dark-bg border-dark-border text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {a.name}
                            <span className="ml-2 text-[10px] text-gray-600">→ {a.horizon}d</span>
                        </button>
                    ))}
                </div>

                {/* Required columns hint */}
                <div className="mt-2 rounded-lg bg-dark-bg border border-dark-border p-2">
                    <p className="text-[10px] text-gray-600 font-semibold uppercase mb-1">Required CSV columns</p>
                    <p className="text-[10px] text-gray-500 font-mono break-all leading-relaxed">
                        {currentAssetCfg?.features.join(', ')}
                    </p>
                </div>
            </section>

            {/* CSV Upload */}
            <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Upload CSV</h3>
                <FileUpload
                    accept=".csv"
                    label="Drop CSV file"
                    onFile={(file) => {
                        setUploadedFile(file)
                        setResult(null)
                        setError(null)
                    }}
                />
                {uploadedFile && (
                    <p className="text-xs text-accent-green mt-1 truncate">✓ {uploadedFile.name}</p>
                )}
            </section>

            {/* Analyse button */}
            <button
                onClick={handleAnalyze}
                disabled={loading || !uploadedFile}
                className={`w-full py-2 rounded-lg text-xs font-bold transition-colors border flex items-center justify-center gap-2 ${
                    loading || !uploadedFile
                        ? 'bg-dark-bg border-dark-border text-gray-500 cursor-not-allowed'
                        : 'bg-accent-blue/10 border-accent-blue text-accent-blue hover:bg-accent-blue/20'
                }`}
            >
                {loading
                    ? <><span className="animate-spin inline-block">⟳</span> Running GRU…</>
                    : '💹 Analyse & Forecast'}
            </button>

            {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2">
                    <p className="text-xs text-red-400">{error}</p>
                </div>
            )}

            {/* Chart controls */}
            <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Chart Type</h3>
                <ToggleTabs
                    tabs={category === 'metal' ? ['Line'] : ['Line', 'Candlestick']}
                    active={category === 'metal' ? 'Line' : chartType}
                    onChange={(t) => { if (category !== 'metal') setChartType(t) }}
                />
                {category === 'metal' && (
                    <p className="text-[10px] text-gray-600 mt-1 italic">Candlestick not available — metals have single price column</p>
                )}
            </section>

            {/* Forecast duration slider — capped at model's horizon */}
            {result && (() => {
                const modelMax = result.forecast.prices.length
                const cap      = Math.min(modelMax, 60)
                const current  = forecastSlice !== null ? forecastSlice : modelMax
                const pct      = ((current - 1) / (cap - 1)) * 100
                return (
                    <section>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Forecast Days</h3>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Showing</span>
                            <span className="font-mono text-accent-blue font-bold">
                                {current} / {modelMax} days
                            </span>
                        </div>
                        <input
                            type="range"
                            min={1}
                            max={cap}
                            step={1}
                            value={current}
                            onInput={e  => setForecastSlice(Number(e.target.value))}
                            onChange={e => setForecastSlice(Number(e.target.value))}
                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                            style={{ background: `linear-gradient(to right, #4f8ef7 ${pct}%, #2e3350 ${pct}%)` }}
                        />
                        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                            <span>1 day</span>
                            <span>{cap} days (model max)</span>
                        </div>
                        {modelMax < 60 && (
                            <p className="text-[10px] text-gray-600 mt-1 italic">
                                This model was trained for {modelMax}-day horizon
                            </p>
                        )}
                    </section>
                )
            })()}

            {/* Metrics card */}
            {result && (
                <StatCard title="Model Metrics">
                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                            <span className="text-gray-500">MAE</span>
                            <span className="text-gray-200 font-mono">{result.metrics.mae}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">RMSE</span>
                            <span className="text-gray-200 font-mono">{result.metrics.rmse}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">MAPE</span>
                            <span className={`font-mono font-bold ${metricColor(result.metrics.mape)}`}>
                                {result.metrics.mape}%
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Horizon</span>
                            <span className="text-gray-200 font-mono">{result.horizon} days</span>
                        </div>
                    </div>
                </StatCard>
            )}

            {/* Market stats */}
            {result && (
                <StatCard title="Forecast Summary">
                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                            <span className="text-gray-500">Last Price</span>
                            <span className="text-white font-semibold font-mono">{lastPrice?.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Day 1 Forecast</span>
                            <span className="text-accent-blue font-mono font-semibold">{firstForecast?.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">End Forecast</span>
                            <span className="text-accent-blue font-mono font-semibold">{lastForecast?.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Expected Δ</span>
                            <span className={`font-semibold font-mono ${parseFloat(forecastChange) >= 0 ? 'text-accent-green' : 'text-red-400'}`}>
                                {forecastChange >= 0 ? '+' : ''}{forecastChange}%
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Signal</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                parseFloat(forecastChange) >= 0
                                    ? 'bg-accent-green/20 text-accent-green border-accent-green/30'
                                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                            }`}>
                                {parseFloat(forecastChange) >= 0 ? '↑ Bullish' : '↓ Bearish'}
                            </span>
                        </div>
                    </div>
                </StatCard>
            )}
        </div>
    )

    return (
        <div className="flex min-h-screen bg-dark-bg">
            <Sidebar>{sidebarContent}</Sidebar>
            <main className="ml-[260px] flex-1 p-6 overflow-y-auto min-h-screen">

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-1">Finance Signal Viewer</h1>
                        <p className="text-sm text-gray-400">{assetName} — {ASSET_REGISTRY[category].label}</p>
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

                {/* Upload prompt */}
                {!result && !loading && (
                    <div className="bg-dark-card rounded-xl border border-dark-border border-dashed p-10 text-center mb-4">
                        <p className="text-gray-500 text-sm mb-1">Upload a CSV file and select your asset</p>
                        <p className="text-gray-600 text-xs">The GRU model will forecast the next {currentAssetCfg?.horizon} day{currentAssetCfg?.horizon > 1 ? 's' : ''}</p>
                    </div>
                )}

                {loading && (
                    <div className="bg-dark-card rounded-xl border border-dark-border p-10 text-center mb-4">
                        <p className="text-accent-blue animate-pulse text-sm">⟳ Running GRU inference…</p>
                    </div>
                )}

                {/* Forecast prices table */}
                {result && (
                    <div className="bg-dark-card rounded-xl border border-dark-border p-4 mb-4">
                        <h3 className="text-sm font-semibold text-gray-300 mb-3">
                            📅 {result.horizon}-Day Forecast — {assetName}
                        </h3>
                        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(result.forecast.dates.length, 6)}, 1fr)` }}>
                            {result.forecast.dates.slice(0, sliceN).map((d, i) => (
                                <div key={d} className="bg-dark-bg rounded-lg p-2 text-center border border-dark-border">
                                    <p className="text-[10px] text-gray-500 mb-0.5">Day {i+1}</p>
                                    <p className="text-[10px] text-gray-600 mb-1">{d}</p>
                                    <p className="text-sm text-accent-green font-bold font-mono">{result.forecast.prices[i]}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Main price chart */}
                <div className="bg-dark-card rounded-xl border border-dark-border p-3 mb-4">
                    <div ref={mainChartRef} />
                </div>

                {/* Volume (stocks only) */}
                {(category === 'stock' || result?.history?.volume) && (
                    <div className="bg-dark-card rounded-xl border border-dark-border p-3 mb-4">
                        <div ref={volumeRef} />
                    </div>
                )}

                {/* Forecast chart */}
                <div className="bg-dark-card rounded-xl border border-dark-border p-3 mb-4">
                    <div ref={forecastRef} />
                    {result && (
                        <div className="grid grid-cols-3 gap-3 mt-3">
                            <div className="bg-dark-bg rounded-lg p-2 text-center border border-dark-border">
                                <p className="text-[10px] text-gray-500 uppercase font-semibold">MAE</p>
                                <p className="text-sm text-accent-blue font-bold font-mono">{result.metrics.mae}</p>
                            </div>
                            <div className="bg-dark-bg rounded-lg p-2 text-center border border-dark-border">
                                <p className="text-[10px] text-gray-500 uppercase font-semibold">RMSE</p>
                                <p className="text-sm text-accent-green font-bold font-mono">{result.metrics.rmse}</p>
                            </div>
                            <div className="bg-dark-bg rounded-lg p-2 text-center border border-dark-border">
                                <p className="text-[10px] text-gray-500 uppercase font-semibold">MAPE</p>
                                <p className={`text-sm font-bold font-mono ${metricColor(result.metrics.mape)}`}>{result.metrics.mape}%</p>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
