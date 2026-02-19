const colormaps = ['Viridis', 'Plasma', 'Inferno', 'Magma', 'Cividis', 'Jet', 'Hot', 'Blues']

export default function ColormapSelector({ value, onChange }) {
    return (
        <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400">Colormap</label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-accent-blue transition-colors"
            >
                {colormaps.map((cm) => (
                    <option key={cm} value={cm}>{cm}</option>
                ))}
            </select>
        </div>
    )
}
