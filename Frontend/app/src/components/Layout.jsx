import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
    return (
        <div className="flex min-h-screen bg-dark-bg font-sans selection:bg-accent-blue/30 selection:text-white">
            <Sidebar />
            <main className="ml-[260px] flex-1 p-8 overflow-y-auto min-h-screen relative">
                {/* Subtle background glow for main content area */}
                <div className="absolute top-0 left-0 w-full h-96 bg-accent-blue/5 rounded-full blur-[150px] pointer-events-none -translate-y-1/2" />
                <div className="relative z-10">
                    <Outlet />
                </div>
            </main>
        </div>
    )
}
