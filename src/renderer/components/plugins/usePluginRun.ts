import { useState, useEffect, useRef } from 'react'

export interface PluginRunState {
    lines: string[]
    running: boolean
    exitCode: number | null
    run: (pluginName: string, args: string[]) => Promise<void>
    reset: () => void
}

export function usePluginRun(): PluginRunState {
    const [lines, setLines] = useState<string[]>([])
    const [running, setRunning] = useState(false)
    const [exitCode, setExitCode] = useState<number | null>(null)
    const unsubRef = useRef<(() => void) | null>(null)

    useEffect(() => {
        return () => { unsubRef.current?.() }
    }, [])

    async function run(pluginName: string, args: string[]) {
        setLines([])
        setExitCode(null)
        setRunning(true)
        const unsub = window.krew.onPluginOutput(line => setLines(prev => [...prev, line]))
        unsubRef.current = unsub
        try {
            const result = await window.krew.runPlugin(pluginName, args)
            setExitCode(result.exitCode)
        } finally {
            unsub()
            unsubRef.current = null
            setRunning(false)
        }
    }

    function reset() {
        setLines([])
        setExitCode(null)
        setRunning(false)
    }

    return { lines, running, exitCode, run, reset }
}
