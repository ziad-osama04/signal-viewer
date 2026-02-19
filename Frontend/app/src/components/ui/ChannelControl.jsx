export default function ChannelControl({ channels, onToggle, onColorChange, onThicknessChange }) {
    return (
        <div className="space-y-2">
            {channels.map((ch) => (
                <div key={ch.id} className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={ch.visible}
                        onChange={() => onToggle(ch.id)}
                        className="w-3.5 h-3.5 rounded accent-accent-blue"
                    />
                    <input
                        type="color"
                        value={ch.color}
                        onChange={(e) => onColorChange(ch.id, e.target.value)}
                        className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <span className="text-xs text-gray-300 w-8">{ch.label}</span>
                    <input
                        type="range"
                        min="1"
                        max="5"
                        value={ch.thickness}
                        onChange={(e) => onThicknessChange(ch.id, parseInt(e.target.value))}
                        className="flex-1"
                    />
                </div>
            ))}
        </div>
    )
}
