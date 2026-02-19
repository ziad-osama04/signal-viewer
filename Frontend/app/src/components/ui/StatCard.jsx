export default function StatCard({ title, children, className }) {
    return (
        <div className={`bg-dark-bg border border-dark-border rounded-xl p-3 space-y-2 ${className || ''}`}>
            {title && (
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h4>
            )}
            {children}
        </div>
    )
}
