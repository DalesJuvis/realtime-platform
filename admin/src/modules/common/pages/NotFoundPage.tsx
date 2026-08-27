/**
 * # NotFoundPage — catch-all 404 route.
 */

import { Link } from 'react-router-dom'
import { Button } from '@components/ui/button'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 text-center">
      <p className="text-6xl font-bold text-muted-foreground">404</p>
      <p className="text-lg text-muted-foreground">This page doesn't exist.</p>
      <Button asChild>
        <Link to="/admin">Back to dashboard</Link>
      </Button>
    </div>
  )
}
