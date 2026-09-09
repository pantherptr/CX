import { Suspense, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, MeshReflectorMaterial, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import type { Group } from 'three';
import type { Rarity } from '../lib/data/empire';
import { RARITY_TINT } from './vehicleVisuals';

/** Coarse device heuristic — this project has no analytics-backed device
 *  tier detection, so rather than invent one, a cheap, honest signal
 *  (touch-primary + modest CPU core count) is enough to decide whether
 *  to spend the reflective floor / shadow budget or not. Wrong guesses
 *  just mean a slightly plainer showroom, never a broken one. */
function isLowPowerDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const fewCores = (navigator.hardwareConcurrency ?? 8) <= 4;
  return coarsePointer && fewCores;
}

function AutoRotate({ speed = 0.35, children }: { speed?: number; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += speed * delta;
  });
  return <group ref={ref}>{children}</group>;
}

function RarityRig({ rarity }: { rarity: Rarity }) {
  const tint = RARITY_TINT[rarity];
  const boosted = rarity === 'legendary' || rarity === 'mythic';
  return (
    <>
      <pointLight position={[-3, 1.4, -2.5]} color={tint} intensity={boosted ? 18 : 8} distance={9} />
      <pointLight position={[3, 1.2, 2.5]} color={tint} intensity={boosted ? 10 : 4} distance={8} />
    </>
  );
}

function ShowroomFloor({ quality, tint }: { quality: 'compact' | 'full'; tint: string }) {
  if (quality === 'compact') {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[3.2, 32]} />
        <meshStandardMaterial color="#0c0d10" roughness={0.9} metalness={0.05} emissive={tint} emissiveIntensity={0.04} />
      </mesh>
    );
  }
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <circleGeometry args={[7, 48]} />
      <MeshReflectorMaterial
        blur={[300, 80]}
        resolution={512}
        mixBlur={1}
        mixStrength={35}
        roughness={0.9}
        depthScale={1.1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.2}
        color="#08090b"
        metalness={0.4}
        mirror={0.35}
      />
    </mesh>
  );
}

interface ShowroomProps {
  rarity: Rarity;
  quality?: 'compact' | 'full';
  autoRotate?: boolean;
  interactive?: boolean;
  children: ReactNode;
}

/**
 * Shared Canvas + lighting + floor rig behind every vehicle in the game
 * — Market cards, Collection cards and the full configurator all mount
 * this with different `quality`/`interactive` settings rather than each
 * inventing their own scene, so the vehicle itself is the only thing
 * that ever changes between them.
 */
export function Showroom({ rarity, quality = 'compact', autoRotate = true, interactive = false, children }: ShowroomProps) {
  const lowPower = useMemo(isLowPowerDevice, []);
  const effectiveQuality: 'compact' | 'full' = lowPower ? 'compact' : quality;
  const dpr: [number, number] = effectiveQuality === 'full' ? [1, 1.75] : [1, 1.25];

  return (
    <Canvas
      shadows={effectiveQuality === 'full'}
      dpr={dpr}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      frameloop="always"
    >
      <PerspectiveCamera makeDefault position={[4.2, 1.6, 4.6]} fov={32} />
      <color attach="background" args={['#0a0b0d']} />
      <fog attach="fog" args={['#0a0b0d', 9, 16]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[4, 6, 3]}
        intensity={1.4}
        castShadow={effectiveQuality === 'full'}
        shadow-mapSize={effectiveQuality === 'full' ? [1024, 1024] : [256, 256]}
      />
      <directionalLight position={[-5, 2, -3]} intensity={0.4} color="#8fb4ff" />
      <RarityRig rarity={rarity} />
      <Suspense fallback={null}>
        <Environment preset="city" environmentIntensity={0.5} />
        {autoRotate ? <AutoRotate>{children}</AutoRotate> : children}
        {effectiveQuality === 'full' && <ContactShadows position={[0, -0.01, 0]} opacity={0.55} scale={10} blur={2.2} far={3} />}
        <ShowroomFloor quality={effectiveQuality} tint={RARITY_TINT[rarity]} />
      </Suspense>
      {interactive && (
        <OrbitControls
          enablePan={false}
          minDistance={2.6}
          maxDistance={8}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.05}
          enableDamping
          dampingFactor={0.08}
        />
      )}
    </Canvas>
  );
}
