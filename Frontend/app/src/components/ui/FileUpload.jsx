import { useState } from 'react'

export default function FileUpload({ accept, label, onFile }) {
    const [fileName, setFileName] = useState(null)
    const [dragOver, setDragOver] = useState(false)

    const handleFile = (file) => {
        if (file) {
            setFileName(file.name)
            onFile && onFile(file)
        }
    }

    return (
        <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
            className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 ${dragOver
                    ? 'border-accent-blue bg-accent-blue/10'
                    : 'border-dark-border hover:border-accent-blue/50 hover:bg-dark-card/30'
                }`}
        >
            <input
                type="file"
                accept={accept}
                onChange={(e) => handleFile(e.target.files[0])}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="text-2xl mb-1">📂</div>
            <p className="text-xs text-gray-400">
                {fileName || label || 'Drop file here or click to upload'}
            </p>
        </div>
    )
}
