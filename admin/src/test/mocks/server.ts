/**
 * # MSW server
 *
 * Node-side request interceptor for tests — every action test adds its own
 * handlers via `server.use(...)` inside the test, resetting to this empty
 * baseline after each test (see `test/setup.ts`).
 */

import { setupServer } from 'msw/node'

export const server = setupServer()
