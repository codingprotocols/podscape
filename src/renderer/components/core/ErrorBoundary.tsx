import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  resetKey?: string
}

interface ErrorBoundaryState {
  error: Error | null
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in fade-in duration-500">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6 text-red-500">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2 tracking-tight">Something went wrong</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm leading-relaxed">
            There was an error loading this section. This usually happens if the resource type is not supported by your cluster version.
          </p>
          <pre className="text-[10px] font-mono bg-red-500/5 text-red-600 dark:text-red-400 p-4 rounded-xl mb-6 max-w-lg overflow-auto border border-red-500/10">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
