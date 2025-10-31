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

const MAX_PLAYERS = 3; // capacity per room (single-room server)

// Track configuration (authoritative)
// Provided by user from in-game sampling
const TRACK = {
  start: { x: 32.40, z: -89.92, rot: 4.494, gridSpacing: 4 }, // gridSpacing now used longitudinally (behind each other)
  finish: { x: -68.04, z: -123.14, rot: 4.439 },
  totalLaps: 3,
};

export function setupSocket(io /** @type {Server} */) {
  io.on('connection', (socket) => {
    const playerId = socket.id;

    // Enforce capacity: reject joins beyond MAX_PLAYERS
    const currentCount = Object.keys(players).length;
    if (currentCount >= MAX_PLAYERS) {
      console.log(`Rejecting ${playerId} - room full (${currentCount}/${MAX_PLAYERS})`);
      socket.emit('roomFull', { max: MAX_PLAYERS });
      // Disconnect politely
      socket.disconnect(true);
      return;
    }

    console.log(`Player connected: ${playerId}`);

    // Compute grid-spawn for this player based on current count (0..2)
    // Arrange cars one behind another along negative forward direction
    const gridIndex = currentCount; // 0,1,2 in order of join
    const fwd = { x: Math.sin(TRACK.start.rot), z: Math.cos(TRACK.start.rot) };
    const offsetScale = gridIndex * TRACK.start.gridSpacing; // 0, spacing, 2*spacing
    const spawnX = TRACK.start.x - fwd.x * offsetScale;
    const spawnZ = TRACK.start.z - fwd.z * offsetScale;

    const spawnState = {
      position: { x: round2(spawnX), y: 0, z: round2(spawnZ) },
      rotation: TRACK.start.rot,
      velocity: { x: 0, y: 0, z: 0 },
      prevPosition: { x: round2(spawnX), y: 0, z: round2(spawnZ) },
      laps: 0,
      lastFinishAt: 0,
    };
    players[playerId] = spawnState;

    console.log(`Total players: ${Object.keys(players).length}`);
    console.log('All players:', Object.keys(players));

    // Send initial payload to the newly connected client (include track config)
    socket.emit('init', {
      id: playerId,
      players: players,
      track: TRACK,
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

      const current = players[playerId] || spawnState;
      const nextPos = sanitizeVec(position, current.position);
      const nextVel = sanitizeVec(velocity, current.velocity);
      const nextRot = typeof rotation === 'number' ? rotation : current.rotation;

      // Lap detection: detect forward crossing of FINISH line plane
      const crossedFinish = didCrossLine(current.position, nextPos, TRACK.finish);
      if (crossedFinish) {
        const now = Date.now();
        if (now - (current.lastFinishAt || 0) > 2000) { // 2s debounce to avoid double counts
          current.laps = (current.laps || 0) + 1;
          current.lastFinishAt = now;
          io.emit('lapUpdate', { id: playerId, laps: current.laps, total: TRACK.totalLaps });
          if (current.laps >= TRACK.totalLaps) {
            io.emit('winner', { id: playerId, reason: 'lapsComplete', t: now });
          }
        }
      }

      const newState = {
        position: nextPos,
        rotation: nextRot,
        velocity: nextVel,
        prevPosition: current.position,
        laps: current.laps || 0,
        lastFinishAt: current.lastFinishAt || 0,
      };
      
      players[playerId] = newState;

      // Broadcast to everyone including sender (authoritative echo)
      io.emit('playerMoved', {
        id: playerId,
        state: newState,
        t: Date.now(),
      });
    });

    // Clean up on disconnect
    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${playerId}`);
      delete players[playerId];
      const remainingIds = Object.keys(players);
      console.log(`Total players: ${remainingIds.length}`);

      socket.broadcast.emit('playerDisconnected', { id: playerId });

      // Last man standing wins: if exactly one player remains, announce winner
      if (remainingIds.length === 1) {
        const winnerId = remainingIds[0];
        console.log(`Announcing winner (last man standing): ${winnerId}`);
        io.emit('winner', { id: winnerId, reason: 'lastManStanding', t: Date.now() });
      }
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

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Detect forward crossing over a line defined by center (x,z) and heading rot
function didCrossLine(prevPos, currPos, line) {
  if (!prevPos || !currPos || !line) return false;
  const nx = Math.sin(line.rot); // forward normal X (match client forward)
  const nz = Math.cos(line.rot); // forward normal Z
  const prevD = (prevPos.x - line.x) * nx + (prevPos.z - line.z) * nz;
  const currD = (currPos.x - line.x) * nx + (currPos.z - line.z) * nz;
  const EPS = 0.3; // hysteresis
  // Crossed from back to front (negative to positive)
  return prevD < -EPS && currD >= EPS;
}
