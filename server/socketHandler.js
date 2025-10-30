// socketHandler.js - manages players and real-time updates
import { Server } from 'socket.io';

/**
 * In-memory store of connected players
 * players[playerId] = {
 *   position: { x, y, z },
 *   rotation: number,
 *   velocity: { x, y, z }
 * }
 */
const players = {}; // simple in-memory store; replace with Redis for production scaling

let playerSpawnIndex = 0;

export function setupSocket(io /** @type {Server} */) {
  io.on('connection', (socket) => {
    const playerId = socket.id;
    console.log(`Player connected: ${playerId}`);

    // Initialize player with side-by-side spawn positions
    const spacing = 3; // 3 units apart
    const baseX = -5; // Start position
    const spawnX = baseX + (playerSpawnIndex * spacing);
    playerSpawnIndex++;
    
    const spawnState = {
      position: { x: spawnX, y: 0, z: 20 },
      rotation: 0,
      velocity: { x: 0, y: 0, z: 0 },
    };
    players[playerId] = spawnState;

    console.log(`Total players: ${Object.keys(players).length}`);
    console.log('All players:', Object.keys(players));

    // Send initial payload to the newly connected client
    socket.emit('init', {
      id: playerId,
      players: players,
    });

    // Notify others about new player
    socket.broadcast.emit('playerJoined', {
      id: playerId,
      state: spawnState,
    });
    console.log(`Broadcasted playerJoined for ${playerId}`);

    // Receive movement updates from this player
    socket.on('playerMove', (payload) => {
      // expected: { id, position: {x,y,z}, rotation, velocity: {x,y,z} }
      const { id, position, rotation, velocity } = payload || {};
      if (!id || id !== playerId) {
        console.warn(`Invalid playerMove from ${playerId}: ID mismatch`);
        return; // ignore spoofed IDs
      }

      const newState = {
        position: sanitizeVec(position, spawnState.position),
        rotation: typeof rotation === 'number' ? rotation : spawnState.rotation,
        velocity: sanitizeVec(velocity, spawnState.velocity),
      };
      
      players[playerId] = newState;

      // Broadcast to everyone except sender
      socket.broadcast.emit('playerMoved', {
        id: playerId,
        state: newState,
        t: Date.now(),
      });
    });

    // Clean up on disconnect
    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${playerId}`);
      delete players[playerId];
      console.log(`Total players: ${Object.keys(players).length}`);
      socket.broadcast.emit('playerDisconnected', { id: playerId });
    });

    // Handle errors
    socket.on('error', (err) => {
      console.error(`Socket error for ${playerId}:`, err);
    });
  });
}

function sanitizeVec(vec, fallback) {
  if (!vec || typeof vec.x !== 'number' || typeof vec.y !== 'number' || typeof vec.z !== 'number') {
    return fallback;
  }
  // Clamp to reasonable bounds to avoid griefing
  return {
    x: clamp(vec.x, -1000, 1000),
    y: clamp(vec.y, -100, 100),
    z: clamp(vec.z, -1000, 1000),
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
