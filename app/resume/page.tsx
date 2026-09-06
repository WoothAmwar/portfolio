'use client'

export default function ResumeViewer() {
    return (
        <div>
            <iframe src="Anwar_Kader_Resume.pdf" className="h-screen w-screen">
            </iframe>
            <p className="bg-white pl-2 text-(--color-surface-text) text-sm">You can view the resume here: <a href="https://www.overleaf.com/read/csdbcjsmvcfv#3cc0ec" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Overleaf link</a></p>
        </div>
    )
}