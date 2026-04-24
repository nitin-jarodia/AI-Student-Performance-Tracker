import { Component } from 'react'
import { AlertTriangle, RefreshCcw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('UI error boundary caught:', error, info)
  }

  handleReset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-red-100 bg-red-50/60 p-6 text-center shadow-card dark:border-red-900/40 dark:bg-red-950/30">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
            Something went wrong
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {error?.message || 'An unexpected error occurred while rendering this page.'}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" onClick={this.handleReset} className="btn-primary">
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-secondary"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    )
  }
}
