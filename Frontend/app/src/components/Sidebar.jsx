import { NavLink } from 'react-router-dom'

const navItems = [
    { to: '/medical', icon: '🫀', label: 'Medical' },
    { to: '/acoustic', icon: '🔊', label: 'Acoustic' },
    { to: '/finance', icon: '📈', label: 'Finance' },
    { to: '/microbiome', icon: '🧬', label: 'Microbiome' },
]

export default function Sidebar({ children }) {
    return (
        <aside className="fixed left-0 top-0 h-screen w-[260px] bg-dark-sidebar border-r border-dark-border flex flex-col z-50 overflow-y-auto">
            {/* Logo */}
            <NavLink to="/" className="flex items-center gap-2 px-5 py-5 border-b border-dark-border hover:bg-dark-card/50 transition-colors">
                <span className="text-2xl">⚡</span>
                <span className="text-lg font-bold text-white tracking-tight">SignalViewer</span>
            </NavLink>

            {/* Nav links */}
            <nav className="flex flex-col gap-1 px-3 py-4">
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${isActive
                                ? 'bg-accent-blue/15 text-accent-blue shadow-sm shadow-accent-blue/10'
                                : 'text-gray-400 hover:text-white hover:bg-dark-card/60'
                            }`
                        }
                    >
                        <span className="text-lg">{item.icon}</span>
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </nav>

            {/* Sidebar controls from page */}
            {children && (
                <div className="flex-1 px-3 pb-4 overflow-y-auto">
                    {children}
                </div>
            )}
        </aside>
    )
}
