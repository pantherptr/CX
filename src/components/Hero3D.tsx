import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * The hero's automotive visual — a live WebGL scene, not a rendered clip.
 * Every frame is drawn by this browser's own GPU: a procedurally built
 * coupe (no external model/license to manage) slow-turntables over a real
 * planar reflection, which is the clearest possible proof this is actually
 * running rather than looping a video — a reflection that tracks a live
 * camera can't be faked by a clip.
 *
 * Deliberately plain Three.js, no React renderer (no @react-three/fiber) —
 * one imperative scene set up and torn down inside a single effect, same
 * "no engine, just draw it" philosophy `DriveChallengeGame` already uses
 * for the canvas game. Kept as its own lazy-loaded chunk (see `Home.tsx`)
 * so the ~600KB of Three.js never loads for a visit that doesn't reach it.
 */

const CX_GREEN = 0x00d447;
const CX_GREEN_DEEP = 0x008536;
const NOIR = 0x0a0d0b;
const NOIR_2 = 0x12160f;

/** Builds the greenhouse (cabin) as an extruded, beveled side-profile —
 *  rear glass rake, flat-ish roof, steep windshield rake — rather than
 *  another box, since the roofline is the one silhouette cue that actually
 *  reads as "coupe" rather than "block on wheels". */
function buildCabin(width: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-1.05, 0.02);
  shape.lineTo(-0.95, 0.42);
  shape.quadraticCurveTo(-0.8, 0.58, -0.55, 0.58);
  shape.lineTo(0.45, 0.58);
  shape.quadraticCurveTo(0.75, 0.58, 0.95, 0.3);
  shape.lineTo(1.05, 0.04);
  shape.lineTo(-1.05, 0.02);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.045,
    bevelSegments: 3,
    curveSegments: 8,
  });
  // The shape lives in the extrude's local XY plane, extruded along +Z —
  // rotate so that extrusion axis becomes car-width (X), the shape's own
  // X becomes car-length (Z), and height (Y) is untouched, then recenter
  // on the extrusion axis (extrude runs 0..width, not -w/2..w/2).
  geo.rotateY(-Math.PI / 2);
  geo.translate(width / 2, 0, 0);
  return geo;
}

function buildWheel(radius: number, tube: number): THREE.Group {
  const group = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 10, 24),
    new THREE.MeshPhysicalMaterial({ color: 0x111311, roughness: 0.75, metalness: 0.1, clearcoat: 0.3 }),
  );
  tire.rotation.y = Math.PI / 2;
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, tube * 2.1, 6),
    new THREE.MeshPhysicalMaterial({ color: 0xb9beb8, roughness: 0.25, metalness: 0.95 }),
  );
  rim.rotation.z = Math.PI / 2;
  group.add(tire, rim);
  return group;
}

/** The whole vehicle as one group, built once from primitives — every
 *  dimension here is a stylized, low-poly sports coupe, not a scan of a
 *  real model, so there's no asset license to track. */
function buildCar(): THREE.Group {
  const car = new THREE.Group();

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x14181a,
    metalness: 0.75,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  });
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.86, 0.56, 3.9, 4, 0.17), bodyMat);
  body.position.y = 0.55;
  car.add(body);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0d1210,
    metalness: 0.2,
    roughness: 0.08,
    transmission: 0.55,
    thickness: 0.3,
    clearcoat: 1,
  });
  const cabin = new THREE.Mesh(buildCabin(1.48), glassMat);
  cabin.position.set(0, 0.55, -0.25);
  car.add(cabin);

  // Wheels — front/rear axle pairs at the corners of a realistic wheelbase.
  const wheelRadius = 0.34;
  const positions: [number, number][] = [
    [0.88, 1.34],
    [-0.88, 1.34],
    [0.88, -1.34],
    [-0.88, -1.34],
  ];
  for (const [x, z] of positions) {
    const wheel = buildWheel(wheelRadius, 0.115);
    wheel.position.set(x, wheelRadius, z);
    car.add(wheel);
  }

  const lightMat = (color: number, intensity: number) =>
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });

  // Headlights.
  for (const x of [0.62, -0.62]) {
    const hl = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.09, 0.05, 2, 0.03), lightMat(0xfff2d9, 0.7));
    hl.position.set(x, 0.55, 1.94);
    car.add(hl);
  }

  // Rear light bar — the one deliberate CX signature: a full-width green
  // strip, echoing the game car's green pinstripe without copying it.
  const tail = new THREE.Mesh(new RoundedBoxGeometry(1.55, 0.075, 0.05, 2, 0.03), lightMat(CX_GREEN, 1.1));
  tail.position.set(0, 0.62, -1.94);
  car.add(tail);

  // Front badge accent.
  const badge = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.045, 0.03, 1, 0.02), lightMat(CX_GREEN, 0.7));
  badge.position.set(0, 0.4, 1.95);
  car.add(badge);

  return car;
}

function buildGroundGlowSprite(): THREE.Sprite {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,212,71,0.3)');
  grad.addColorStop(1, 'rgba(0,212,71,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  );
  sprite.scale.set(4.2, 4.2, 1);
  sprite.position.set(0, 0.02, 0);
  return sprite;
}

export default function Hero3D() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      // No WebGL available — the container's own dark background shows
      // through with nothing drawn, rather than a crash.
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.setClearColor(NOIR, 1);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(NOIR, 0.05);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    // Distance chosen so the car's ~2.4-unit bounding radius comfortably
    // fits a 32° vertical FOV with margin around it (radius / sin(16°) ≈
    // 8.7 units minimum) — closer than this crops into the bodywork.
    const cameraBase = new THREE.Vector3(5.9, 2.6, 7.9);
    camera.position.copy(cameraBase);
    camera.lookAt(0, 0.45, 0);

    // Environment reflections — what actually makes the paint/glass/rims
    // read as "real" material rather than flat color.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const hemi = new THREE.HemisphereLight(0x1c2620, 0x05060a, 0.4);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff2df, 1.15);
    key.position.set(4, 5, 2);
    scene.add(key);
    const fillLight = new THREE.DirectionalLight(0x9fb0c2, 0.35);
    fillLight.position.set(-3, 2, 4);
    scene.add(fillLight);
    // A true rim/edge light — narrow and from behind, so it catches the
    // silhouette's edge rather than flooding the whole front of the car.
    const rim = new THREE.DirectionalLight(CX_GREEN, 0.55);
    rim.position.set(-2.5, 1.4, -4);
    scene.add(rim);
    const underglow = new THREE.PointLight(CX_GREEN, 0.9, 2.6, 2.4);
    underglow.position.set(0, 0.1, 0);
    scene.add(underglow);

    const car = buildCar();
    car.rotation.y = -0.86;
    scene.add(car);
    scene.add(buildGroundGlowSprite());

    // Reflective showroom floor — a real planar reflection, re-rendered
    // every frame, so it always exactly matches the live camera/turntable.
    const floorGeo = new THREE.CircleGeometry(14, 48);
    const reflector = new Reflector(floorGeo, {
      textureWidth: 512 * dpr,
      textureHeight: 512 * dpr,
      color: 0x0b0f0c,
    });
    reflector.rotation.x = -Math.PI / 2;
    scene.add(reflector);
    // A translucent dark overlay on top of the reflector keeps the
    // reflection subtle (a showroom floor, not a mirror) without touching
    // Reflector's own render-target internals.
    const floorTint = new THREE.Mesh(
      floorGeo,
      new THREE.MeshBasicMaterial({ color: NOIR_2, transparent: true, opacity: 0.62 }),
    );
    floorTint.rotation.x = -Math.PI / 2;
    floorTint.position.y = 0.001;
    scene.add(floorTint);

    // A faint grid, echoing the DRIVE game's lane markings — ties this
    // scene back to the same visual language rather than inventing a new one.
    const grid = new THREE.GridHelper(28, 28, CX_GREEN_DEEP, 0x1a201c);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.18;
    grid.position.y = 0.003;
    scene.add(grid);

    // Ambient drifting particles — sparse, additive, cosmetic only.
    const particleCount = reducedMotion ? 0 : 70;
    let particles: THREE.Points | null = null;
    if (particleCount > 0) {
      const posArr = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount; i++) {
        posArr[i * 3] = (Math.random() - 0.5) * 10;
        posArr[i * 3 + 1] = Math.random() * 3.2;
        posArr[i * 3 + 2] = (Math.random() - 0.5) * 10;
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      const pMat = new THREE.PointsMaterial({
        color: CX_GREEN,
        size: 0.028,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      particles = new THREE.Points(pGeo, pMat);
      scene.add(particles);
    }

    // Postprocessing — a restrained bloom so only the bright accents
    // (headlights, the green light bar, rim highlights) actually glow.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.4, 0.9);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      bloom.setSize(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Subtle pointer parallax — desktop only (no touch-drag hijacking on
    // mobile); a real cursor-reactive camera is one more thing a
    // prerecorded clip simply cannot do.
    let pointerX = 0;
    let pointerY = 0;
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = container.getBoundingClientRect();
      pointerX = ((e.clientX - r.left) / r.width - 0.5) * 2;
      pointerY = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    if (!reducedMotion) window.addEventListener('pointermove', onPointerMove);

    // Only spend GPU time while the hero is actually visible on screen.
    let visible = true;
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { threshold: 0.05 });
    io.observe(container);

    let raf = 0;
    const clock = new THREE.Clock();
    const renderFrame = () => composer.render();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      const t = clock.getElapsedTime();

      if (!reducedMotion) {
        car.rotation.y = -0.62 + t * 0.11;
        camera.position.x = cameraBase.x + pointerX * 0.35;
        camera.position.y = cameraBase.y - pointerY * 0.18;
        camera.lookAt(0, 0.45, 0);
        if (particles) particles.rotation.y = t * 0.015;
        underglow.intensity = 0.85 + Math.sin(t * 1.6) * 0.12;
      }
      renderFrame();
    };

    if (reducedMotion) {
      // One well-composed static frame — still genuinely WebGL-rendered,
      // just no continuous animation loop, honoring the OS preference
      // while staying a real 3D scene rather than a swapped-in image.
      renderFrame();
    } else {
      loop();
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      composer.dispose();
      pmrem.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if ('map' in m && m.map) (m.map as THREE.Texture).dispose();
            m.dispose();
          }
        }
      });
      reflector.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="A CX vehicle in a rotating 3D showcase"
      className="absolute inset-0 h-full w-full"
      style={{ background: `#${NOIR.toString(16).padStart(6, '0')}` }}
    />
  );
}
