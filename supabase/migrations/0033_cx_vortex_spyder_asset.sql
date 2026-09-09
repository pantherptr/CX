-- CX Rent's own automotive universe: every Empire vehicle is now
-- branded "CX" (previously a mix of placeholder brand names), and the
-- Vortex Spyder — the flagship — points at a real, purpose-built 3D
-- asset (public/models/cx-vortex-spyder.glb, built via the Blender
-- pipeline in blender/build_cx_vortex_spyder.py) instead of the shared
-- generic placeholder every other template still uses.
--
-- `silhouette` doubles as the 3D asset lookup key on the frontend
-- (see src/three/vehicleVisuals.ts MODEL_SOURCES) — every other
-- template keeps its existing category-shaped silhouette (scaled
-- against the shared placeholder); only this row gets its own key.

update public.game_vehicle_templates set brand = 'CX';

update public.game_vehicle_templates
set silhouette = 'cx-vortex-spyder'
where name = 'Vortex Spyder' and brand = 'CX';
