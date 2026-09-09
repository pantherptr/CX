import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import {
  type VehicleConfig,
  modelSourceFor,
  proportionFor,
  paintFor,
  wheelFor,
  glassFor,
  headlightFor,
  interiorFor,
  caliperFor,
  exhaustFor,
  bodyKitFor,
  applyConditionWear,
  RARITY_TINT,
} from './vehicleVisuals';

useGLTF.preload(modelSourceFor('sedan'));
useGLTF.preload(modelSourceFor('cx-vortex-spyder'));

const ADDON_PREFIX = 'cx-addon-';

/** Marks a material this component constructed itself, so cleanup only
 *  ever disposes materials we own — never the shared, cached materials
 *  `useGLTF` hands out to every other instance of the same model. */
function ownedMaterial<T extends THREE.Material>(mat: T): T {
  mat.userData.cxOwned = true;
  return mat;
}

function disposeOwned(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material?.userData?.cxOwned) {
      (obj.material as THREE.Material).dispose();
    }
  });
}

function clearAddons(root: THREE.Object3D) {
  const stale = root.children.filter((c) => c.name.startsWith(ADDON_PREFIX));
  for (const c of stale) {
    root.remove(c);
    c.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material?.userData?.cxOwned) (obj.material as THREE.Material).dispose();
      }
    });
  }
}

/**
 * Renders the actual owned/for-sale vehicle — real geometry, real PBR
 * materials, driven entirely by the vehicle's own persisted state
 * (rarity, silhouette, condition, customization). This is the single
 * component every surface (Market card, Collection card, the full
 * configurator, and — once built — Auction) renders through, so a
 * customized car can never look different in one place than another.
 */
export function CxCarModel({ config }: { config: VehicleConfig }) {
  const url = modelSourceFor(config.silhouette);
  const { scene } = useGLTF(url);
  const proportion = proportionFor(config.silhouette);

  // `scene` is the one cached hierarchy `useGLTF` shares with every
  // instance of this URL — clone the node graph so each vehicle gets
  // its own Object3D tree. Materials are still the shared originals at
  // this point; the effect below replaces every one we care about with
  // an instance-owned copy before anything is ever mutated.
  const root = useMemo(() => scene.clone(true), [scene]);

  useLayoutEffect(() => {
    const wear = config.conditionAvg;
    const paint = paintFor(config);
    const wheel = wheelFor(config);
    const glass = glassFor(config);
    const headlight = headlightFor(config);
    const interior = interiorFor(config);

    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const name = obj.name;
      obj.castShadow = true;
      obj.receiveShadow = true;

      if (obj.material?.userData?.cxOwned) (obj.material as THREE.Material).dispose();

      if (name.startsWith('CX_Body')) {
        const worn = applyConditionWear(new THREE.Color(paint.color), paint.roughness, paint.clearcoat, wear);
        obj.material = ownedMaterial(new THREE.MeshPhysicalMaterial({
          color: worn.color, metalness: paint.metalness, roughness: worn.roughness,
          clearcoat: worn.clearcoat, clearcoatRoughness: paint.clearcoatRoughness,
        }));
      } else if (name.startsWith('CX_Rim') || name.startsWith('Rim_Spoke')) {
        obj.material = ownedMaterial(new THREE.MeshStandardMaterial({
          color: wheel.color, metalness: wheel.metalness, roughness: wheel.roughness,
        }));
      } else if (name.startsWith('CX_Glass')) {
        obj.material = ownedMaterial(new THREE.MeshPhysicalMaterial({
          color: glass.color, transmission: glass.transmission, roughness: 0.05,
          ior: 1.45, thickness: 0.05, metalness: 0,
        }));
      } else if (name.startsWith('CX_Headlight')) {
        obj.material = ownedMaterial(new THREE.MeshStandardMaterial({
          color: '#ffffff', emissive: new THREE.Color(headlight.color), emissiveIntensity: headlight.intensity, roughness: 0.4,
        }));
      } else if (name.startsWith('CX_Taillight')) {
        obj.material = ownedMaterial(new THREE.MeshStandardMaterial({
          color: '#600000', emissive: new THREE.Color('#ff0d0d'), emissiveIntensity: 2.2, roughness: 0.4,
        }));
      } else if (name === 'CX_Dash' || name.startsWith('CX_Seat')) {
        obj.material = ownedMaterial(new THREE.MeshStandardMaterial({
          color: interior.color, roughness: interior.roughness, metalness: 0,
        }));
      } else if (name.startsWith('CX_Tire')) {
        const worn = applyConditionWear(new THREE.Color('#161616'), 0.75, 0, wear);
        obj.material = ownedMaterial(new THREE.MeshStandardMaterial({ color: worn.color, roughness: worn.roughness, metalness: 0 }));
      } else if (name.startsWith('CX_Badge')) {
        const tint = RARITY_TINT[config.rarity];
        obj.material = ownedMaterial(new THREE.MeshStandardMaterial({
          color: tint, emissive: new THREE.Color(tint), emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.3,
        }));
      }
    });

    return () => disposeOwned(root);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, config.rarity, config.conditionAvg, JSON.stringify(config.customization)]);

  // Brakes/exhaust/body-kit: on an asset that models these parts for
  // real (CX Vortex Spyder), toggle the pre-built part's visibility and
  // retint it — a genuine geometry change with no runtime mesh
  // construction. On the older shared placeholder asset, which has no
  // such parts, fall back to bolting on simple procedural geometry so
  // the option still visibly does something.
  useLayoutEffect(() => {
    clearAddons(root);
    const caliper = caliperFor(config);
    const exhaust = exhaustFor(config);
    const kit = bodyKitFor(config);

    let usedRealParts = false;

    const brakeCorners = ['FL', 'FR', 'RL', 'RR'].map((tag) => root.getObjectByName(`Brake_${tag}`));
    if (brakeCorners.some(Boolean)) {
      usedRealParts = true;
      for (const disc of brakeCorners) {
        if (!disc) continue;
        disc.visible = Boolean(caliper);
        if (caliper) {
          disc.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;
            if (obj.material?.userData?.cxOwned) (obj.material as THREE.Material).dispose();
            const isCaliper = obj.name.startsWith('Brake_Caliper');
            obj.material = ownedMaterial(new THREE.MeshStandardMaterial(
              isCaliper
                ? { color: caliper.color, metalness: 0.5, roughness: 0.35 }
                : { color: '#3a3a3d', metalness: 0.8, roughness: 0.4 },
            ));
          });
        }
      }
    }

    const exhaustObj = root.getObjectByName('Exhaust');
    if (exhaustObj) {
      usedRealParts = true;
      exhaustObj.visible = Boolean(exhaust);
      if (exhaust) {
        exhaustObj.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          if (obj.material?.userData?.cxOwned) (obj.material as THREE.Material).dispose();
          obj.material = ownedMaterial(new THREE.MeshStandardMaterial({ color: exhaust.color, metalness: exhaust.metalness, roughness: exhaust.roughness }));
        });
      }
    }

    const spoiler = root.getObjectByName('Spoiler');
    const skirtL = root.getObjectByName('Side_Skirt_Wide_L');
    const skirtR = root.getObjectByName('Side_Skirt_Wide_R');
    if (spoiler || skirtL || skirtR) {
      usedRealParts = true;
      if (spoiler) spoiler.visible = Boolean(kit);
      if (skirtL) skirtL.visible = kit === 'widebody';
      if (skirtR) skirtR.visible = kit === 'widebody';
    }

    if (usedRealParts) return;

    // --- Procedural fallback (older placeholder asset) ---
    if (caliper) {
      for (const name of ['CX_Rim_FL', 'CX_Rim_FR', 'CX_Rim_RL', 'CX_Rim_RR']) {
        const rim = root.getObjectByName(name);
        if (!rim) continue;
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.22, 0.05, 10, 20),
          ownedMaterial(new THREE.MeshStandardMaterial({ color: caliper.color, metalness: 0.5, roughness: 0.35 })),
        );
        ring.name = `${ADDON_PREFIX}caliper`;
        ring.position.copy(rim.position);
        ring.rotation.copy(rim.rotation);
        ring.castShadow = true;
        root.add(ring);
      }
    }

    if (exhaust) {
      const rearRim = root.getObjectByName('CX_Rim_RL') ?? root.getObjectByName('CX_Rim_RR');
      const rearX = (rearRim?.position.x ?? 1.4) + 0.55;
      const offsets = exhaust.dual ? [-0.35, 0.35] : [0];
      for (const z of offsets) {
        const pipe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.1, 0.32, 16),
          ownedMaterial(new THREE.MeshStandardMaterial({ color: exhaust.color, metalness: exhaust.metalness, roughness: exhaust.roughness })),
        );
        pipe.name = `${ADDON_PREFIX}exhaust`;
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(rearX, 0.28, z);
        pipe.castShadow = true;
        root.add(pipe);
      }
    }

    if (kit) {
      const wide = kit === 'widebody';
      const wingWidth = wide ? 1.75 : 1.45;
      const wing = new THREE.Group();
      wing.name = `${ADDON_PREFIX}bodykit`;
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.04, wingWidth),
        ownedMaterial(new THREE.MeshPhysicalMaterial({ color: '#0c0c0e', metalness: 0.2, roughness: 0.35, clearcoat: 0.6 })),
      );
      blade.position.set(-2.05, 0.72, 0);
      blade.castShadow = true;
      wing.add(blade);
      for (const side of [-1, 1]) {
        const strut = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.22, 0.06),
          ownedMaterial(new THREE.MeshStandardMaterial({ color: '#0c0c0e', metalness: 0.3, roughness: 0.4 })),
        );
        strut.position.set(-2.0, 0.58, side * (wingWidth / 2 - 0.1));
        wing.add(strut);
      }
      if (wide) {
        for (const side of [-1, 1]) {
          const skirt = new THREE.Mesh(
            new THREE.BoxGeometry(2.6, 0.08, 0.1),
            ownedMaterial(new THREE.MeshStandardMaterial({ color: '#0c0c0e', metalness: 0.2, roughness: 0.5 })),
          );
          skirt.position.set(0, 0.18, side * 0.98);
          wing.add(skirt);
        }
      }
      root.add(wing);
    }

    return () => clearAddons(root);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, JSON.stringify(config.customization)]);

  useEffect(() => () => disposeOwned(root), [root]);

  return (
    <group scale={[proportion.length, proportion.height, proportion.width]} position={[0, proportion.rideHeight, 0]}>
      <primitive object={root} />
    </group>
  );
}
