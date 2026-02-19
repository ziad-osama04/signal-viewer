export default function SliderControl({ label, min, max, step, value, onChange, unit }) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-400">{label}</label>
                <span className="text-xs font-semibold text-accent-blue">
                    {value}{unit || ''}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step || 1}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full"
            />
        </div>
    )
}
