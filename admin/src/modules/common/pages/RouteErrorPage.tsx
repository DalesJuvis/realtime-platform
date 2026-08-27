/**
 * # RouteErrorPage — router-level `errorElement`.
 *
 * Catches errors react-router itself surfaces (loader throws, a lazy-chunk
 * import failing after a deploy, render errors inside a route) — distinct
 * from `AppErrorBoundary`, which only catches errors outside the router.
 */

import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom'
import { ErrorFallback } from '@components/shared/ErrorFallback'

export default function RouteErrorPage() {
  const error = useRouteError()
  const navigate = useNavigate()

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : undefined

  return <ErrorFallback message={message} onReset={() => navigate(0)} />
}
