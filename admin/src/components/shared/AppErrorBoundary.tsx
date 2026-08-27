/**
 * # AppErrorBoundary
 *
 * Top-level React error boundary — catches render/lifecycle errors anywhere
 * in the tree that the router's own `errorElement` wouldn't see (e.g. an
 * error thrown by a provider above `RouterProvider`). Renders `ErrorFallback`;
 * "Reload page" is a full reload since local component state can't be trusted
 * to recover cleanly after an uncaught render error.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorFallback } from './ErrorFallback'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Uncaught render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback message={this.state.error.message} />
    }
    return this.props.children
  }
}
