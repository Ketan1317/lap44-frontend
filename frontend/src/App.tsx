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
  const [timeLeftMs, setTimeLeftMs] = useState<number>(0);
  const keysRef = useRef({
    w: false, a: false, s: false, d: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key in keysRef.current) {
        // @ts-ignore
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
        setError('Failed to load car model. Please ensure car.glb exists in /public/models/');
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
        setError('Failed to load track model. Please ensure track.glb exists in /public/models/');
        setLoading(false);
      }
    };
    loadCar();
    loadTrack();

    const url = 'http://localhost:3001';
    const s = io(url, { transports: ['websocket'], reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: 5 });
    setSocket(s);

    const onConnect = () => setPlayerId(s.id || '');
    const onDisconnect = () => {};
    const onConnectError = (_: any) => {};
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
    <div style={{ width: '100%', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
      <Canvas shadows camera={{ fov: 75, near: 0.1, far: 1000 }} style={{ width: '100%', height: '100%' }} frameloop="always" dpr={[1, 1]} performance={{ min: 0.4, max: 0.9 }} gl={{ powerPreference: 'high-performance', antialias: false, stencil: false, depth: true }}>
<Suspense fallback={null}>
          {carGltf && trackGltf && socket && (
            <Scene carGltf={carGltf} trackGltf={trackGltf} keysRef={keysRef} socket={socket} playerId={playerId} setPlayerCount={setPlayerCount} gameOver={gameOver} />
          )}
        </Suspense>
      </Canvas>
      {racePhase === 'countdown' && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '20px 28px', borderRadius: 10, fontSize: 40 }}>Starting in {countdown}</div>
      )}
      {raceEndAt > 0 && (
        <div style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 20, fontFamily: 'monospace' }}>{new Date(Math.max(0, raceEndAt - Date.now())).toISOString().substring(14, 19)}</div>
      )}
      {loading && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0, 0, 0, 0.8)', color: 'white', padding: '30px 50px', borderRadius: '10px', fontSize: '24px' }}>Loading F1 Racing Game...</div>
      )}
      {error && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(200, 0, 0, 0.9)', color: 'white', padding: '30px 50px', borderRadius: '10px', fontSize: '18px', maxWidth: '600px', textAlign: 'center' }}>{error}</div>
      )}
      <div style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(0, 0, 0, 0.7)', color: 'white', padding: '15px 20px', borderRadius: '8px', fontSize: '14px' }}>
        <div style={{ marginBottom: '10px', fontSize: '18px', fontWeight: 'bold' }}>Controls</div>
        <div>W / ↑ - Accelerate</div>
        <div>S / ↓ - Brake / Reverse</div>
        <div>A / ← - Turn Left</div>
        <div>D / → - Turn Right</div>
        <div style={{ marginTop: '10px', fontSize: '12px', opacity: 0.8 }}>Player ID: {playerId || 'Connecting...'}</div>
        <div style={{ fontSize: '12px', opacity: 0.8 }}>Players: {playerCount}/3</div>
        <div style={{ marginTop: '6px', fontSize: '14px' }}>Lap: {Math.min(laps + 1, TOTAL_LAPS)}/{TOTAL_LAPS}</div>
      </div>
      {gameOver && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0, 128, 0, 0.9)', color: 'white', padding: '30px 50px', borderRadius: '10px', fontSize: '24px' }}>Winner: {winnerId}</div>
      )}
    </div>
  );
};

export default F1RacingGame;
