// index.js - Express + Socket.io setup with CORS
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { setupSocket } from './socketHandler.js';

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const ORIGIN = process.env.CLIENT_ORIGIN || '*';

app.use(cors({ origin: ORIGIN }));
app.use(express.json());

// Health check and simple landing on '/'
app.get('/', (_req, res) => {
  res.status(200).json({ ok: true, message: 'Multiplayer Racing Server running', version: '1.0.0' });
});

const io = new Server(server, {
  cors: {
    origin: ORIGIN,
    methods: ['GET', 'POST'],
  },
});

setupSocket(io);

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
