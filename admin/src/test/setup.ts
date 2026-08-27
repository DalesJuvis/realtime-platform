/**
 * # Vitest setup
 *
 * Loaded before every test file (see `vite.config.ts`'s `test.setupFiles`).
 * Registers jest-dom matchers and starts/stops the MSW server so no test
 * ever reaches a real network socket.
 */

import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './mocks/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
