/* eslint-disable @typescript-eslint/ban-ts-comment */
import React, { useEffect, useRef, useState, Suspense, lazy } from 'react';
import { Canvas } from '@react-three/fiber';
import { GLTFLoader } from 'three-stdlib';
import { io } from 'socket.io-client';

const Scene = lazy(() => import('./components/Scene'));

/* eslint-disable @typescript-eslint/no-explicit-any */
const TOTAL_LAPS = 2;

const F1RacingGame: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [carGltf, setCarGltf] = useState<any>(null);
  const [trackGltf, setTrackGltf] = useState<any>(null);
  const [socket, setSocket] = useState<any>(null);
  const [playerId, setPlayerId] = useState<string>('');
  const [playerCount, setPlayerCount] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [winnerId, setWinnerId] = useState<string>('');
  const [laps, setLaps] = useState<number>(0);
  const [racePhase, setRacePhase] = useState<'lobby'|'countdown'|'racing'|'ended'>('lobby');
  const [countdown, setCountdown] = useState<number>(0);
  const [raceEndAt, setRaceEndAt] = useState<number>(0);
  const [, setTimeLeftMs] = useState<number>(0);
  const keysRef = useRef({
    w: false, a: false, s: false, d: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key in keysRef.current) {
        // @ts-expect-error
        keysRef.current[e.key] = true;
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key in keysRef.current) {
        // @ts-ignore
        keysRef.current[e.key] = false;
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let modelsLoaded = 0;
    const loader = new GLTFLoader();
    const loadCar = async () => {
      try {
        const gltf = await loader.loadAsync('/models/car.glb');
        if (mounted) {
          setCarGltf(gltf);
          modelsLoaded++;
          if (modelsLoaded === 2) setLoading(false);
        }
      } catch (err) {
        setError('Failed to load car model. Please ensure car.glb exists in /public/models/' + err);
        setLoading(false);
      }
    };
    const loadTrack = async () => {
      try {
        const gltf = await loader.loadAsync('/models/track.glb');
        if (mounted) {
          setTrackGltf(gltf);
          modelsLoaded++;
          if (modelsLoaded === 2) setLoading(false);
        }
      } catch (err) {
        setError('Failed to load track model. Please ensure track.glb exists in /public/models/'+err);
        setLoading(false);
      }
    };
    loadCar();
    loadTrack();

    const url = import.meta.env.VITE_SOCKET_URL;
    const s = io(url, { transports: ['websocket'], reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: 5 });
    setSocket(s);

    const onConnect = () => setPlayerId(s.id || '');
    const onDisconnect = () => {};
    const onConnectError = () => {};
    const onInit = ({ id }: any) => {
      setPlayerId(id);
      setGameOver(false);
      setWinnerId('');
      setLaps(0);
    };
    const onRoomFull = ({ max }: any) => setError(`Room is full (max ${max}). Please try again later.`);
    const onWinner = ({ id }: any) => { setWinnerId(id); setGameOver(true); setRacePhase('ended'); };
    const onLapUpdate = ({ id, laps }: any) => { if (id === s.id) setLaps(laps); };
    const onRaceState = ({ phase, countdown, endAt }: any) => {
      if (phase) setRacePhase(phase);
      setCountdown(countdown || 0);
      if (endAt) setRaceEndAt(endAt);
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);
    s.on('init', onInit);
    s.on('roomFull', onRoomFull);
    s.on('winner', onWinner);
    s.on('lapUpdate', onLapUpdate);
    s.on('raceState', onRaceState);

    return () => {
      mounted = false;
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onConnectError);
      s.off('init', onInit);
      s.off('roomFull', onRoomFull);
      s.off('winner', onWinner);
      s.off('lapUpdate', onLapUpdate);
      s.off('raceState', onRaceState);
      s.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!raceEndAt) return;
    const i = setInterval(() => setTimeLeftMs(Math.max(0, raceEndAt - Date.now())), 200);
    return () => clearInterval(i);
  }, [raceEndAt]);

  return (
   <div className="relative w-full h-screen overflow-hidden bg-black">
  <Canvas
    shadows
    camera={{ fov: 75, near: 0.1, far: 1000 }}
    frameloop="always"
    dpr={[1, 1]}
    performance={{ min: 0.4, max: 0.9 }}
    gl={{ powerPreference: 'high-performance', antialias: false, stencil: false, depth: true }}
    className="w-full h-full"
  >
    <Suspense fallback={null}>
      {carGltf && trackGltf && socket && (
        <Scene
          carGltf={carGltf}
          trackGltf={trackGltf}
          keysRef={keysRef}
          socket={socket}
          playerId={playerId}
          setPlayerCount={setPlayerCount}
          gameOver={gameOver}
        />
      )}
    </Suspense>
  </Canvas>

  {/* Countdown Overlay */}
  {racePhase === 'countdown' && (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="text-5xl md:text-6xl font-bold text-white animate-pulse">
        Starting in <span className="text-green-400">{countdown}</span>
      </div>
    </div>
  )}

  {/* Race Timer */}
  {raceEndAt > 0 && (
    <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-md text-white font-mono px-4 py-2 rounded-lg text-lg shadow-md border border-white/10">
      {new Date(Math.max(0, raceEndAt - Date.now())).toISOString().substring(14, 19)}
    </div>
  )}

  {/* Loading Screen */}
  {loading && (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="text-white text-2xl md:text-3xl font-semibold px-8 py-6 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 shadow-xl">
        Loading <span className="text-yellow-300">F1 Racing</span> Game...
      </div>
    </div>
  )}

  {/* Error Popup */}
  {error && (
    <div className="absolute inset-0 flex items-center justify-center bg-red-900/90 backdrop-blur-md">
      <div className="text-white max-w-lg text-center text-lg px-8 py-6 rounded-xl shadow-xl border border-red-400">
        {error}
      </div>
    </div>
  )}

  {/* Controls Panel */}
  <div className="absolute top-5 left-5 bg-black/70 backdrop-blur-md text-white px-5 py-4 rounded-xl text-sm md:text-base shadow-md border border-white/10">
    <div className="text-lg font-bold mb-3 tracking-wide text-green-400">Controls</div>
    <div>W / ↑ – Accelerate</div>
    <div>S / ↓ – Brake / Reverse</div>
    <div>A / ← – Turn Left</div>
    <div>D / → – Turn Right</div>
    <div className="mt-3 text-xs opacity-75">Player ID: <span className="text-yellow-300">{playerId || 'Connecting...'}</span></div>
    <div className="text-xs opacity-75">Players: {playerCount}/3</div>
    <div className="mt-2 text-sm font-medium">Lap: {Math.min(laps + 1, TOTAL_LAPS)}/{TOTAL_LAPS}</div>
  </div>

  {/* Game Over */}
  {gameOver && (
    <div className="absolute inset-0 flex items-center justify-center bg-green-900/90 backdrop-blur-sm">
      <div className="text-white text-3xl md:text-4xl font-bold px-10 py-6 rounded-xl shadow-2xl border border-green-400">
        🏁 Winner: <span className="text-yellow-300">{winnerId}</span>
      </div>
    </div>
  )}
</div>

  );
};

export default F1RacingGame;
