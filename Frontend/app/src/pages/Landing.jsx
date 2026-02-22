import { useNavigate } from 'react-router-dom'

const cards = [
    {
        to: '/medical',
        icon: '🫀',
        name: 'Medical',
        desc: 'ECG signal analysis with AI-powered anomaly detection',
        gradient: 'from-rose-500/10 to-pink-600/10 hover:from-rose-500/20 hover:to-pink-600/20',
        border: 'border-white/5 hover:border-rose-500/30',
        glow: 'hover:shadow-[0_0_30px_rgba(244,63,94,0.15)]',
        delay: 'animation-delay-100'
    },
    {
        to: '/acoustic',
        icon: '🔊',
        name: 'Acoustic',
        desc: 'Doppler effect simulation and drone detection',
        gradient: 'from-amber-500/10 to-orange-600/10 hover:from-amber-500/20 hover:to-orange-600/20',
        border: 'border-white/5 hover:border-amber-500/30',
        glow: 'hover:shadow-[0_0_30px_rgba(245,158,11,0.15)]',
        delay: 'animation-delay-200'
    },
    {
        to: '/finance',
        icon: '📈',
        name: 'Finance',
        desc: 'Market analysis with candlestick charts and forecasting',
        gradient: 'from-accent-green/10 to-emerald-600/10 hover:from-accent-green/20 hover:to-emerald-600/20',
        border: 'border-white/5 hover:border-accent-green/30',
        glow: 'hover:shadow-[0_0_30px_rgba(16,185,129,0.15)]',
        delay: 'animation-delay-300'
    },
    {
        to: '/microbiome',
        icon: '🧬',
        name: 'Microbiome',
        desc: 'Gut microbiome diversity and abundance analysis',
        gradient: 'from-violet-500/10 to-purple-600/10 hover:from-violet-500/20 hover:to-purple-600/20',
        border: 'border-white/5 hover:border-violet-500/30',
        glow: 'hover:shadow-[0_0_30px_rgba(139,92,246,0.15)]',
        delay: 'animation-delay-400'
    },
]

export default function Landing() {
    const navigate = useNavigate()

    return (
        <div className="min-h-screen bg-dark-bg flex flex-col items-center justify-center px-6 relative overflow-hidden font-sans">
            {/* Background effects */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-dark-card via-dark-bg to-dark-bg" />

            {/* Animated glowing orbs */}
            <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] bg-accent-blue/5 rounded-full blur-[120px] animate-pulse-glow" />
            <div className="absolute bottom-[10%] right-[20%] w-[500px] h-[500px] bg-accent-green/5 rounded-full blur-[120px] animate-pulse-glow" style={{ animationDelay: '1.5s' }} />

            {/* Hero */}
            <div className="relative z-10 text-center mb-16 animate-fade-in-up">
                <div className="flex items-center justify-center gap-4 mb-6">
                    <span className="text-5xl drop-shadow-glow-blue">⚡</span>
                    <h1 className="text-6xl md:text-7xl font-extrabold text-white tracking-tight">
                        Signal<span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-blue to-accent-green">Viewer</span>
                    </h1>
                </div>
                <p className="text-xl text-gray-400 max-w-lg mx-auto font-light tracking-wide">
                    Enterprise multi-domain signal analysis platform
                </p>
            </div>

            {/* Cards */}
            <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl w-full">
                {cards.map((card, idx) => (
                    <button
                        key={card.to}
                        onClick={() => navigate(card.to)}
                        style={{ animationDelay: `${idx * 100 + 200}ms` }}
                        className={`group relative overflow-hidden rounded-2xl p-6 text-left transition-all duration-500
                            bg-white/5 backdrop-blur-xl border ${card.border} ${card.glow}
                            hover:-translate-y-2 hover:scale-[1.02] cursor-pointer
                            animate-fade-in-up opacity-0 fill-mode-forwards`}
                    >
                        {/* Interactive gradient overlay */}
                        <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} transition-colors duration-500 pointer-events-none`} />

                        <div className="relative z-10">
                            <div className="text-4xl mb-5 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 transform-origin-bottom-left">
                                {card.icon}
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2 tracking-wide">{card.name}</h3>
                            <p className="text-sm text-gray-400 leading-relaxed font-light">{card.desc}</p>

                            <div className="mt-6 flex items-center gap-2 text-sm font-medium text-white opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-2 group-hover:translate-y-0">
                                <span className="w-6 h-px bg-white/50"></span>
                                Explore Module
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    )
}
