import React, { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/* eslint-disable @typescript-eslint/no-explicit-any */
const FRAME_STEP_MS = 33;
const NET_STEP_MS = 50;

const Scene = ({ carGltf, trackGltf, keysRef, socket, playerId, setPlayerCount, gameOver }: {
  carGltf: any;
  trackGltf: any;
  keysRef: React.MutableRefObject<any>;
  socket: any;
  playerId: string;
  setPlayerCount: React.Dispatch<React.SetStateAction<number>>;
  gameOver: boolean;
}) => {
  const carRef = useRef<THREE.Group>(null);
  const trackRef = useRef<THREE.Group>(null);
  const remoteCarsRef = useRef<Map<string, THREE.Group>>(new Map());
  const remoteCarStatesRef = useRef<Map<string, {
    position: THREE.Vector3;
    rotation: number;
    targetPos: THREE.Vector3;
    targetRot: number;
    velocity: THREE.Vector3;
    lastUpdate: number;
    serverTime: number;
  }>>(new Map());
  const boundaryBoxesRef = useRef<THREE.Box3[]>([]);
  const trackBoundariesRef = useRef({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });
  const DEFAULT_TRACK = { start: { x: 32.4, z: -89.92, rot: 4.494 }, finish: { x: -68.04, z: -123.14, rot: 4.439 } };
  const [trackConfig, setTrackConfig] = useState<any>(DEFAULT_TRACK);

  const carStateRef = useRef({
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: 0,
    speed: 0,
    maxSpeed: 2.4,
    acceleration: 0.05,
    deceleration: 0.03,
    brakingForce: 0.12,
    turnSpeed: 0.05,
    friction: 0.96,
    driftFactor: 0.88,
    grip: 0.93,
    lateralVelocity: 0,
    isDrifting: false,
    mass: 1.0,
    drag: 0.0015,
    tractionControl: 0.85,
    steeringSmoothing: 0.15,
    stability: 0.94,
    initialized: false,
  });

  const cameraOffsetRef = useRef(new THREE.Vector3(0, 5, -10));
  const cameraLookOffsetRef = useRef(new THREE.Vector3(0, 1, 5));
  const { scene, camera } = useThree();
  const computedRef = useRef(false);
  const lastNetUpdateRef = useRef(Date.now());
  const frameAccumulatorRef = useRef(0);

  useEffect(() => {
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 30, 150);
    camera.position.set(0, 5, 30);
  }, [scene, camera]);

  useEffect(() => {
    if (carRef.current) {
      carRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    }
  }, [carGltf]);

  useEffect(() => {
    if (!socket || !carGltf || !playerId) return;

    const ensureRemoteCar = (id: string, state: any) => {
      if (!id || id === playerId || id === socket.id) return;
      if (!remoteCarsRef.current.has(id)) {
        const clone = carGltf.scene.clone(true);
        clone.traverse((child: any) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            if (child.material && child.material.clone) {
              child.material = child.material.clone();
              child.material.color = new THREE.Color(Math.random(), Math.random(), Math.random());
            }
          }
        });
        const group = new THREE.Group();
        group.add(clone);
        group.scale.set(1.3, 1.3, 1.3);
        const spawnX = state?.position?.x ?? 0;
        const spawnZ = state?.position?.z ?? 20;
        const spawnRot = state?.rotation ?? 0;
        group.position.set(spawnX, 0, spawnZ);
        group.rotation.y = spawnRot;
        scene.add(group);
        remoteCarsRef.current.set(id, group);
        remoteCarStatesRef.current.set(id, {
          position: new THREE.Vector3(spawnX, 0, spawnZ),
          rotation: spawnRot,
          targetPos: new THREE.Vector3(spawnX, 0, spawnZ),
          targetRot: spawnRot,
          velocity: new THREE.Vector3(0, 0, 0),
          lastUpdate: Date.now(),
          serverTime: Date.now(),
        });
      }
    };

    const onInit = (payload: any) => {
      const { id, players, track } = payload || {};
      if (track) setTrackConfig(track);
      setPlayerCount(Object.keys(players || {}).length);
      const myState = players[id];
      if (myState?.position && !carStateRef.current.initialized) {
        carStateRef.current.position.set(myState.position.x, 0, myState.position.z);
        carStateRef.current.rotation = myState.rotation || 0;
        carStateRef.current.initialized = true;
      }
      Object.entries(players || {}).forEach(([pid, state]) => {
        if (pid !== id) ensureRemoteCar(pid, state);
      });
    };

    const onPlayerJoined = ({ id, state }: any) => {
      ensureRemoteCar(id, state);
      setPlayerCount((prev) => prev + 1);
    };

    const onPlayerMoved = ({ id, state }: any) => {
      if (id === socket?.id) {
        if (state?.position && typeof state.rotation === 'number') {
          carStateRef.current.position.set(state.position.x, 0, state.position.z);
          carStateRef.current.rotation = state.rotation;
          if (carRef.current) {
            carRef.current.position.set(state.position.x, 0, state.position.z);
            carRef.current.rotation.y = state.rotation;
          }
        }
        return;
      }
      ensureRemoteCar(id, state);
      const entry = remoteCarStatesRef.current.get(id);
      if (entry && state?.position && typeof state.rotation === 'number') {
        entry.targetPos.set(state.position.x, 0, state.position.z);
        entry.targetRot = state.rotation;
        entry.lastUpdate = Date.now();
        const group = remoteCarsRef.current.get(id);
        if (group) {
          group.position.set(state.position.x, 0, state.position.z);
          group.rotation.y = state.rotation;
        }
      }
    };

    const onPlayerDisconnected = ({ id }: any) => {
      const group = remoteCarsRef.current.get(id);
      if (group) {
        scene.remove(group);
        remoteCarsRef.current.delete(id);
        remoteCarStatesRef.current.delete(id);
        setPlayerCount((prev) => Math.max(0, prev - 1));
      }
    };

    socket.on('init', onInit);
    socket.on('playerJoined', onPlayerJoined);
    socket.on('playerMoved', onPlayerMoved);
    socket.on('playerDisconnected', onPlayerDisconnected);

    return () => {
      socket.off('init', onInit);
      socket.off('playerJoined', onPlayerJoined);
      socket.off('playerMoved', onPlayerMoved);
      socket.off('playerDisconnected', onPlayerDisconnected);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, carGltf, scene, playerId]);

  useEffect(() => {
    if (trackRef.current) {
      trackRef.current.updateMatrixWorld(true);
      boundaryBoxesRef.current = [];
      trackRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.receiveShadow = true;
          child.castShadow = true;
          const bbox = new THREE.Box3().setFromObject(child);
          const nameLower = child.name.toLowerCase();
          if (
            !nameLower.includes('road') &&
            !nameLower.includes('ground') &&
            !nameLower.includes('floor') &&
            !nameLower.includes('terrain') &&
            !nameLower.includes('asphalt') &&
            !nameLower.includes('surface') &&
            (nameLower.includes('tree') ||
             nameLower.includes('barrier') ||
             nameLower.includes('wall') ||
             nameLower.includes('obstacle') ||
             nameLower.includes('curb') ||
             nameLower.includes('guardrail') ||
             nameLower.includes('fence') ||
             nameLower.includes('building') ||
             nameLower.includes('pole') ||
             nameLower.includes('sign') ||
             bbox.min.y > 0.1)
          ) {
            boundaryBoxesRef.current.push(bbox.clone());
          }
        }
      });
      const trackBBox = new THREE.Box3().setFromObject(trackRef.current);
      const padding = 5;
      trackBoundariesRef.current = {
        minX: trackBBox.min.x - padding,
        maxX: trackBBox.max.x + padding,
        minZ: trackBBox.min.z - padding,
        maxZ: trackBBox.max.z + padding,
      };
      computedRef.current = true;
    }
  }, [trackGltf]);

  const checkCollision = (newPos: THREE.Vector3): { collided: boolean; normal?: THREE.Vector3 } => {
    const carBBox = new THREE.Box3(
      new THREE.Vector3(newPos.x - 0.8, 0, newPos.z - 1.2),
      new THREE.Vector3(newPos.x + 0.8, 1.0, newPos.z + 1.2)
    );
    for (const bbox of boundaryBoxesRef.current) {
      if (carBBox.intersectsBox(bbox)) {
        const bboxCenter = new THREE.Vector3();
        bbox.getCenter(bboxCenter);
        const collisionNormal = new THREE.Vector3().subVectors(newPos, bboxCenter).normalize();
        collisionNormal.y = 0;
        return { collided: true, normal: collisionNormal };
      }
    }
    return { collided: false };
  };

  const isWithinBoundaries = (pos: THREE.Vector3): boolean => {
    const b = trackBoundariesRef.current;
    return pos.x >= b.minX && pos.x <= b.maxX && pos.z >= b.minZ && pos.z <= b.maxZ;
  };
  const clampToBoundaries = (pos: THREE.Vector3): THREE.Vector3 => {
    const b = trackBoundariesRef.current;
    const clamped = pos.clone();
    clamped.x = Math.max(b.minX, Math.min(b.maxX, pos.x));
    clamped.z = Math.max(b.minZ, Math.min(b.maxZ, pos.z));
    return clamped;
  };

  useFrame((_, delta) => {
    if (!carRef.current) return;
    if (gameOver) return;

    frameAccumulatorRef.current += delta * 1000;
    if (frameAccumulatorRef.current < FRAME_STEP_MS) return;
    frameAccumulatorRef.current = 0;

    if (!computedRef.current && trackRef.current) {
      trackRef.current.updateMatrixWorld(true);
      computedRef.current = true;
    }

    const carState = carStateRef.current;
    const keys = keysRef.current;

    const forward = keys.w || keys.ArrowUp;
    const backward = keys.s || keys.ArrowDown;
    const left = keys.a || keys.ArrowLeft;
    const right = keys.d || keys.ArrowRight;

    if (forward) {
      const speedRatio = Math.abs(carState.speed) / carState.maxSpeed;
      const accelMultiplier = 1.0 - speedRatio * 0.6;
      carState.speed = Math.min(carState.speed + carState.acceleration * accelMultiplier, carState.maxSpeed);
    } else if (backward) {
      if (carState.speed > 0.1) carState.speed = Math.max(carState.speed - carState.brakingForce, 0);
      else carState.speed = Math.max(carState.speed - carState.acceleration * 0.6, -carState.maxSpeed * 0.4);
    } else {
      if (Math.abs(carState.speed) > 0.001) {
        const dragForce = carState.drag * carState.speed * Math.abs(carState.speed);
        carState.speed *= carState.friction;
        carState.speed -= dragForce;
        if (Math.abs(carState.speed) < 0.001) carState.speed = 0;
      } else {
        carState.speed = 0;
      }
    }

    let turnAmount = 0;
    if (Math.abs(carState.speed) > 0.01) {
      const speedFactor = Math.abs(carState.speed) / carState.maxSpeed;
      const turnMultiplier = 1.0 + speedFactor * 0.5;
      if (left) { turnAmount = carState.turnSpeed * turnMultiplier; carState.rotation += turnAmount; }
      if (right) { turnAmount = -carState.turnSpeed * turnMultiplier; carState.rotation += turnAmount; }
      if (Math.abs(turnAmount) > 0 && Math.abs(carState.speed) > carState.maxSpeed * 0.5) {
        carState.isDrifting = true;
        carState.lateralVelocity += turnAmount * carState.speed * 0.3;
        carState.lateralVelocity *= carState.driftFactor;
      } else {
        carState.isDrifting = false;
        carState.lateralVelocity *= carState.grip;
      }
    } else {
      carState.lateralVelocity *= 0.9;
    }

    const forwardDir = new THREE.Vector3(Math.sin(carState.rotation), 0, Math.cos(carState.rotation));
    const lateralDir = new THREE.Vector3(Math.cos(carState.rotation), 0, -Math.sin(carState.rotation));
    const moveDirection = forwardDir.multiplyScalar(carState.speed).add(lateralDir.multiplyScalar(carState.lateralVelocity));
    const newPosition = carState.position.clone().add(moveDirection);

    if (!isWithinBoundaries(newPosition)) {
      const clampedPosition = clampToBoundaries(newPosition);
      carState.position.copy(clampedPosition);
      carState.speed *= 0.2;
      carState.lateralVelocity *= 0.2;
    } else {
      const collision = checkCollision(newPosition);
      if (!collision.collided) {
        carState.position.copy(newPosition);
      } else {
        const normal = collision.normal!;
        carState.speed *= -0.4;
        carState.lateralVelocity *= 0.3;
        const slideDirection = new THREE.Vector3(-normal.z, 0, normal.x);
        const slideAmount = moveDirection.dot(slideDirection);
        const slidePosition = carState.position.clone().add(slideDirection.multiplyScalar(slideAmount * 0.3));
        const pushBack = normal.multiplyScalar(0.3);
        carState.position.add(pushBack);
        const slideCollision = checkCollision(slidePosition);
        if (!slideCollision.collided && isWithinBoundaries(slidePosition)) {
          carState.position.copy(slidePosition);
        }
      }
    }

    if (carRef.current) {
      carRef.current.position.copy(carState.position);
      carRef.current.position.y = 0;
      carRef.current.rotation.y = carState.rotation;
    }

    const now = Date.now();
    if (socket && socket.connected && playerId && socket.id && now - lastNetUpdateRef.current >= NET_STEP_MS) {
      lastNetUpdateRef.current = now;
      socket.emit('playerMove', {
        id: socket.id,
        position: { x: carState.position.x, y: carState.position.y, z: carState.position.z },
        rotation: carState.rotation,
        velocity: { x: moveDirection.x, y: 0, z: moveDirection.z },
      });
    }

    remoteCarStatesRef.current.forEach((entry, id) => {
      const group = remoteCarsRef.current.get(id);
      if (!group) return;
      entry.position.copy(entry.targetPos);
      entry.rotation = entry.targetRot;
      group.position.set(entry.position.x, 0, entry.position.z);
      group.rotation.y = entry.rotation;
    });

    const idealOffset = cameraOffsetRef.current.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), carState.rotation);
    const idealPosition = carState.position.clone().add(idealOffset);
    camera.position.lerp(idealPosition, 0.1);
    const idealLookAt = carState.position.clone().add(cameraLookOffsetRef.current.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), carState.rotation));
    const currentLookAt = new THREE.Vector3();
    camera.getWorldDirection(currentLookAt);
    currentLookAt.multiplyScalar(10).add(camera.position);
    currentLookAt.lerp(idealLookAt, 0.1);
    camera.lookAt(currentLookAt);
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[50, 100, 50]} intensity={0.8} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-near={0.5} shadow-camera-far={300} shadow-camera-left={-50} shadow-camera-right={50} shadow-camera-top={50} shadow-camera-bottom={-50} />
      {carGltf && (<primitive object={carGltf.scene} ref={carRef} scale={1.3} position={[carStateRef.current.position.x, 0, carStateRef.current.position.z]} />)}
      {trackGltf && (<primitive object={trackGltf.scene} ref={trackRef} scale={1} position={[0, 0, 0]} />)}
    </>
  );
};

export default Scene;
