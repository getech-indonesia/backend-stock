import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

function parseCorsOrigins(value?: string): string[] {
  return (value ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

@WebSocketGateway({
  cors: {
    origin: parseCorsOrigins(process.env.FRONTEND_ORIGIN),
    credentials: true,
  },
  namespace: 'pubex',
})
export class PubExGateway {
  @WebSocketServer()
  server!: Server;

  emitJobUpdated(payload: unknown) {
    if (process.env.ENABLE_WEBSOCKET === 'false') {
      return;
    }

    this.server.emit('pubex.updated', payload);
  }
}

