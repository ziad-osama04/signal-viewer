import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
    return (
        <div className="flex min-h-screen bg-dark-bg">
            <Sidebar />
            <main className="ml-[260px] flex-1 p-6 overflow-y-auto min-h-screen">
                <Outlet />
            </main>
        </div>
    )
}
