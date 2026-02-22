import { NavLink } from 'react-router-dom'

const navItems = [
    { to: '/medical', icon: '🫀', label: 'Medical' },
    { to: '/acoustic', icon: '🔊', label: 'Acoustic' },
    { to: '/finance', icon: '📈', label: 'Finance' },
    { to: '/microbiome', icon: '🧬', label: 'Microbiome' },
]

export default function Sidebar({ children }) {
    return (
        <aside className="fixed left-0 top-0 h-screen w-[260px] bg-dark-sidebar/90 backdrop-blur-2xl border-r border-dark-border flex flex-col z-50 overflow-y-auto font-sans shadow-2xl">
            {/* Logo */}
            <NavLink to="/" className="flex items-center gap-3 px-6 py-6 border-b border-dark-border/50 hover:bg-white/[0.02] transition-colors group">
                <span className="text-2xl drop-shadow-glow-blue group-hover:scale-110 transition-transform duration-300">⚡</span>
                <span className="text-xl font-bold text-white tracking-wide">Signal<span className="text-accent-blue">Viewer</span></span>
            </NavLink>

            {/* Nav links */}
            <nav className="flex flex-col gap-1.5 px-4 py-6">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Analysis Modules</div>
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `group flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden ${isActive
                                ? 'text-white shadow-lg shadow-accent-blue/10'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                {isActive && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-accent-blue/20 to-transparent pointer-events-none" />
                                )}
                                {isActive && (
                                    <div className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-accent-blue rounded-r-full shadow-glow-blue" />
                                )}
                                <span className={`text-xl transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>{item.icon}</span>
                                <span className="relative z-10">{item.label}</span>
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* Sidebar controls from page */}
            {children && (
                <div className="flex-1 px-4 pb-6 overflow-y-auto">
                    <div className="w-full h-px bg-dark-border/50 mb-6" />
                    {children}
                </div>
            )}
        </aside>
    )
}
