import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'pubex',
})
export class PubExGateway {
  @WebSocketServer()
  server!: Server;

  emitJobUpdated(payload: unknown) {
    this.server.emit('pubex.updated', payload);
  }
}

