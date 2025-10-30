# Multiplayer Racing Game - Testing Guide

## Setup

### 1. Start the Backend Server
```powershell
cd server
node index.js
```
Server should start on `http://localhost:3001`

### 2. Start the Frontend
```powershell
cd frontend
npm run dev
```
Frontend should start on `http://localhost:5173`

## Testing Multiplayer

### Test 1: Two Players
1. Open `http://localhost:5173` in your browser
2. Open another tab or window with `http://localhost:5173`
3. **Expected behavior:**
   - Each tab shows a different Player ID in top-left corner
   - You should see TWO cars on the track (one yours, one other player's)
   - Remote player's car should be a different random color
   - When you drive in one tab, the car should move in the other tab

### Test 2: Multiple Players (3+)
1. Open 3 or more browser tabs/windows
2. **Expected behavior:**
   - Each tab shows unique Player ID
   - All tabs show ALL cars (including your own)
   - Moving in any tab updates position in all other tabs
   - Cars are interpolated smoothly (no jerky movement)

### Test 3: Player Disconnect
1. Have 2+ tabs open
2. Close one tab
3. **Expected behavior:**
   - Closed player's car disappears from other tabs
   - Console logs show "Player disconnected: [ID]"

## Debugging

### Check Browser Console
Press F12 and look for:
- ✅ "Connecting to socket server: http://localhost:3001"
- ✅ "Socket connected! ID: [socket-id]"
- ✅ "Received init event: {id: '...', players: {...}}"
- ✅ "Creating remote car for player [id]"
- ✅ "Player joined: [id]"

### Check Server Console
Look for:
- ✅ "Player connected: [socket-id]"
- ✅ "Total players: [number]"
- ✅ "All players: [list of IDs]"
- ✅ "Broadcasted playerJoined for [id]"

### Common Issues

**Issue: Remote cars not appearing**
- Check browser console for errors
- Verify socket connection established (check for "Socket connected!" message)
- Ensure server is running and reachable

**Issue: Cars appear but don't move**
- Check if `playerMove` events are being emitted (browser console)
- Check if `playerMoved` events are being received (browser console)
- Verify Player ID matches between client and server

**Issue: Jerky movement**
- This is expected with high latency
- Interpolation factor can be adjusted (currently 0.25) in App.tsx line 387

**Issue: Cars spawning at wrong position**
- All cars spawn at position (0, 0.2, 20)
- This is intentional for testing
- Players should drive away from spawn point to avoid overlap

## Performance

- Update rate: 30Hz (33ms intervals) - Improved from 20Hz
- Interpolation: Adaptive (0.35-0.8 based on distance)
- Prediction: Velocity-based client-side prediction
- Transport: WebSocket (fallback to polling)
- Bandwidth: ~200 bytes per update per player

## Key Improvements (v2)

✅ **Side-by-side spawning** - Players spawn 3 units apart horizontally
✅ **Velocity-based prediction** - Predicts car position based on velocity to compensate for network delay
✅ **Adaptive interpolation** - Faster catch-up when cars are far apart, smoother when close
✅ **Higher update rate** - 30Hz instead of 20Hz for more accurate real-time updates
✅ **Improved rotation interpolation** - 0.4 factor for responsive steering
✅ **Player count display** - Shows total connected players in real-time

## Next Steps

If everything works:
1. ✅ Multiplayer is fully functional
2. Consider adding:
   - Player names/labels above cars
   - Lap counter and race timing
   - Collision detection between players
   - Better spawn positions (spread out)
   - Minimap showing all players
   - Chat system
