import { useNavigate } from 'react-router-dom'

const cards = [
    {
        to: '/medical',
        icon: '🫀',
        name: 'Medical',
        desc: 'ECG signal analysis with AI-powered anomaly detection',
        gradient: 'from-rose-500/20 to-pink-600/20',
        border: 'hover:border-rose-500/50',
        glow: 'hover:shadow-rose-500/20',
    },
    {
        to: '/acoustic',
        icon: '🔊',
        name: 'Acoustic',
        desc: 'Doppler effect simulation and drone detection',
        gradient: 'from-amber-500/20 to-orange-600/20',
        border: 'hover:border-amber-500/50',
        glow: 'hover:shadow-amber-500/20',
    },
    {
        to: '/finance',
        icon: '📈',
        name: 'Finance',
        desc: 'Market analysis with candlestick charts and forecasting',
        gradient: 'from-emerald-500/20 to-green-600/20',
        border: 'hover:border-emerald-500/50',
        glow: 'hover:shadow-emerald-500/20',
    },
    {
        to: '/microbiome',
        icon: '🧬',
        name: 'Microbiome',
        desc: 'Gut microbiome diversity and abundance analysis',
        gradient: 'from-violet-500/20 to-purple-600/20',
        border: 'hover:border-violet-500/50',
        glow: 'hover:shadow-violet-500/20',
    },
]

export default function Landing() {
    const navigate = useNavigate()

    return (
        <div className="min-h-screen bg-dark-bg flex flex-col items-center justify-center px-6 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 bg-gradient-to-br from-accent-blue/5 via-transparent to-accent-green/5" />
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-blue/10 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-green/10 rounded-full blur-3xl" />

            {/* Hero */}
            <div className="relative z-10 text-center mb-16">
                <div className="flex items-center justify-center gap-3 mb-6">
                    <span className="text-5xl">⚡</span>
                    <h1 className="text-6xl font-extrabold text-white tracking-tight">
                        Signal<span className="text-accent-blue">Viewer</span>
                    </h1>
                </div>
                <p className="text-xl text-gray-400 font-light max-w-lg mx-auto">
                    Multi-domain signal analysis platform
                </p>
                <div className="mt-4 w-24 h-1 bg-gradient-to-r from-accent-blue to-accent-green rounded-full mx-auto" />
            </div>

            {/* Cards */}
            <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl w-full">
                {cards.map((card) => (
                    <button
                        key={card.to}
                        onClick={() => navigate(card.to)}
                        className={`group bg-dark-card border border-dark-border rounded-2xl p-6 text-left transition-all duration-300
              ${card.border} ${card.glow}
              hover:shadow-2xl hover:-translate-y-1 hover:scale-[1.02]
              bg-gradient-to-br ${card.gradient}`}
                    >
                        <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
                            {card.icon}
                        </div>
                        <h3 className="text-lg font-bold text-white mb-1.5">{card.name}</h3>
                        <p className="text-xs text-gray-400 leading-relaxed">{card.desc}</p>
                        <div className="mt-4 flex items-center gap-1 text-xs font-medium text-accent-blue opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            Open viewer →
                        </div>
                    </button>
                ))}
            </div>
        </div>
    )
}
