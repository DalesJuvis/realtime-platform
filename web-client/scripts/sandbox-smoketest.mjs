import { RealtimeClient } from 'file:///C:/Users/EVERMATE/Documents/dev/realtime-platform/sdk-typescript/dist/index.js'
import WebSocket from 'ws'

const token = process.argv[2]
const client = new RealtimeClient({
  wsUrl: 'ws://localhost:8080/ws',
  tenantId: '00000000-0000-0000-0000-000000000001',
  token,
  webSocketImpl: WebSocket,
})

client.on('open', () => console.log('customer: connected'))
client.subscribe('support:demo', (m) => console.log('customer received:', m.payload))
client.connect()

setTimeout(() => {
  client.publish('support:demo', 'Hi, I need help with my order.')
  console.log('customer: sent initial message')
}, 500)

setTimeout(() => {
  console.log('customer: staying alive for admin to observe...')
}, 1000)

// Stay alive for 20s so the admin sandbox test window can see this session.
setTimeout(() => {
  client.disconnect()
  process.exit(0)
}, 20000)
