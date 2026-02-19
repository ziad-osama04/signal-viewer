export default function ToggleTabs({ tabs, active, onChange }) {
    return (
        <div className="flex bg-dark-bg rounded-lg p-0.5 gap-0.5">
            {tabs.map((tab) => (
                <button
                    key={tab}
                    onClick={() => onChange(tab)}
                    className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${active === tab
                            ? 'bg-accent-blue text-white shadow-md shadow-accent-blue/20'
                            : 'text-gray-400 hover:text-white hover:bg-dark-card/60'
                        }`}
                >
                    {tab}
                </button>
            ))}
        </div>
    )
}
