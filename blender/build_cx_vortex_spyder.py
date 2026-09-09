"""
CX VORTEX SPYDER — procedural build script for Blender 5.x (bpy).

An original mid-engine roadster silhouette for the CX Rent Empire game.
Run headless:

    blender --background --python blender/build_cx_vortex_spyder.py -- preview
    blender --background --python blender/build_cx_vortex_spyder.py -- export

"preview" renders a multi-angle contact sheet for visual iteration on the
shape without paying the cost of a full export. "export" builds
everything (wheels, glass, lights, interior, bumpers, spoiler, exhaust),
assigns materials, and writes the optimized GLB used by the app.

Naming follows the convention the app's CxCarModel.tsx already expects
(CX_Body, CX_Glass_*, CX_Rim_*, CX_Tire_*, CX_Headlight_*, CX_Taillight_*,
CX_Mirror_*, CX_Dash, CX_Seat_*) plus new toggle-only parts for
customization that needs a real geometry swap rather than a material
tweak (Spoiler, Front_Bumper_Wide, Rear_Bumper_Wide, Side_Skirt_Wide,
Exhaust_Sport, Exhaust_Titanium, Brake_FL/FR/RL/RR).
"""

import bpy
import bmesh
import math
import sys
from mathutils import Vector, Matrix

# ---------------------------------------------------------------------
# CLI arg (after "--")
# ---------------------------------------------------------------------
argv = sys.argv
mode = 'export'
if '--' in argv:
    rest = argv[argv.index('--') + 1:]
    if rest:
        mode = rest[0]

OUT_GLB = '/Users/feqy/Downloads/velora/public/models/cx-vortex-spyder.glb'
RENDER_DIR = '/private/tmp/claude-501/-Users-feqy-Downloads-velora/6067c134-c320-449f-ae0b-b5a9b0dfa811/scratchpad/renders/'

# ---------------------------------------------------------------------
# Clean scene
# ---------------------------------------------------------------------
def clean_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block_type in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(block_type):
            if block.users == 0:
                block_type.remove(block)


# ---------------------------------------------------------------------
# Body — lofted cross-sections along X (nose -X, tail +X), half-profile
# in the Y (height) / Z (width) plane, mirrored across Z=0.
# Each profile is bottom-center -> bottom-side -> shoulder -> beltline
# -> deck/screen edge -> top-center, all as (y, z) pairs.
# ---------------------------------------------------------------------
STATIONS = [
    # x,     profile: (height z, half-width y) — bottom-centre, sill,
    #        shoulder (widest — crease line), upper-shoulder, beltline,
    #        deck/screen edge, top-centre. Dimensions target a real
    #        mid-engine-supercar envelope: 4.5m long, 2.65m wheelbase,
    #        ~1.85m wide, ~1.05m tall at the highest point (rear deck).
    (-2.36, [(0.07, 0.00), (0.08, 0.08), (0.10, 0.13), (0.12, 0.14), (0.14, 0.11), (0.17, 0.06), (0.19, 0.00)]),  # nose tip — low, narrow point
    (-2.20, [(0.06, 0.00), (0.07, 0.42), (0.10, 0.58), (0.16, 0.60), (0.26, 0.50), (0.38, 0.26), (0.44, 0.00)]),  # front splitter edge
    (-1.95, [(0.10, 0.00), (0.11, 0.40), (0.20, 0.62), (0.32, 0.64), (0.46, 0.52), (0.56, 0.28), (0.60, 0.00)]),  # front bumper / intakes
    (-1.65, [(0.11, 0.00), (0.12, 0.44), (0.26, 0.70), (0.42, 0.74), (0.58, 0.58), (0.66, 0.30), (0.70, 0.00)]),  # front arch leading edge
    (-1.45, [(0.11, 0.00), (0.12, 0.46), (0.28, 0.74), (0.46, 0.78), (0.62, 0.60), (0.70, 0.30), (0.74, 0.00)]),  # front axle
    (-0.95, [(0.11, 0.00), (0.12, 0.42), (0.30, 0.66), (0.48, 0.62), (0.56, 0.46), (0.62, 0.22), (0.64, 0.00)]),  # cowl / screen base
    (-0.40, [(0.11, 0.00), (0.12, 0.40), (0.30, 0.62), (0.46, 0.56), (0.52, 0.40), (0.56, 0.18), (0.58, 0.00)]),  # door / cockpit front
    (0.20,  [(0.11, 0.00), (0.12, 0.42), (0.32, 0.64), (0.48, 0.58), (0.56, 0.42), (0.60, 0.20), (0.62, 0.00)]),  # seat-back bulkhead
    (0.68,  [(0.12, 0.00), (0.13, 0.44), (0.34, 0.56), (0.50, 0.54), (0.62, 0.44), (0.68, 0.22), (0.70, 0.00)]),  # side-intake scoop — pinched in vs. its neighbours
    (1.10,  [(0.13, 0.00), (0.14, 0.54), (0.40, 0.82), (0.62, 0.80), (0.76, 0.58), (0.84, 0.28), (0.88, 0.00)]),  # rear haunch leading edge
    (1.35,  [(0.13, 0.00), (0.14, 0.58), (0.42, 0.88), (0.64, 0.84), (0.78, 0.60), (0.86, 0.28), (0.90, 0.00)]),  # rear axle / widest
    (1.65,  [(0.14, 0.00), (0.15, 0.48), (0.36, 0.70), (0.54, 0.62), (0.64, 0.44), (0.70, 0.20), (0.72, 0.00)]),  # rear deck / engine cover
    (1.95,  [(0.15, 0.00), (0.16, 0.34), (0.28, 0.48), (0.38, 0.42), (0.46, 0.30), (0.52, 0.14), (0.54, 0.00)]),  # rear bumper
    (2.20,  [(0.08, 0.00), (0.09, 0.22), (0.16, 0.30), (0.24, 0.28), (0.30, 0.20), (0.34, 0.10), (0.36, 0.00)]),  # tail / diffuser edge
]


# ---------------------------------------------------------------------
# Wheel geometry — shared constants so the body's arch cutters and the
# actual wheel meshes agree exactly on position and clearance. Sized
# like real 20"/21" supercar wheel-and-tyre packages (~0.69m/0.71m
# rolling diameter).
# ---------------------------------------------------------------------
WHEEL_X_FRONT = -1.45
WHEEL_X_REAR = 1.35
WHEEL_TRACK_Y = 0.80      # wheel-centre offset from the car's centreline
WHEEL_RADIUS = 0.345
WHEEL_WIDTH = 0.26
ARCH_RADIUS = 0.385

WHEEL_POSITIONS_HALF = [(WHEEL_X_FRONT, WHEEL_TRACK_Y), (WHEEL_X_REAR, WHEEL_TRACK_Y)]


def make_arch_cutter(name, x, y):
    # A short radial "drill" through the body's side wall only — deep
    # enough to break through the outer surface and open the arch, but
    # not so deep it reaches the centreline and severs the floor/spine.
    depth = 0.9
    center_y = y + 0.28 if y > 0 else y - 0.28
    bpy.ops.mesh.primitive_cylinder_add(radius=ARCH_RADIUS, depth=depth, location=(x, center_y, WHEEL_RADIUS))
    cutter = bpy.context.active_object
    cutter.name = name
    cutter.rotation_euler = (math.radians(90), 0, 0)
    cutter.hide_render = True
    cutter.hide_viewport = True
    return cutter


def build_body():
    # World convention (Blender-native): X = length, Y = width (half-profile,
    # mirrored onto -Y), Z = height. Station profiles below are authored as
    # (height, half_width) pairs and mapped to (x, width, height) here.
    bm = bmesh.new()
    ring_verts = []
    for x, profile in STATIONS:
        ring = [bm.verts.new((x, z, y)) for (y, z) in profile]
        ring_verts.append(ring)

    n = len(STATIONS[0][1])
    for a, b in zip(ring_verts, ring_verts[1:]):
        for i in range(n - 1):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))

    # Cap nose and tail (fan from the centreline bottom point through to
    # the centreline top point of the end ring).
    bm.faces.new(ring_verts[0])
    bm.faces.new(list(reversed(ring_verts[-1])))

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new('CX_Body_Mesh')
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new('CX_Body', mesh)
    bpy.context.collection.objects.link(obj)

    mirror = obj.modifiers.new('Mirror', 'MIRROR')
    mirror.use_axis[0] = False
    mirror.use_axis[1] = True
    mirror.use_axis[2] = False

    # Arch cuts run AFTER the mirror so they act on the closed, watertight
    # full-width body — one cutter per side per axle.
    i = 0
    for x, y in WHEEL_POSITIONS_HALF:
        for side in (1, -1):
            cutter = make_arch_cutter(f'ArchCutter_{i}', x, y * side)
            boolean = obj.modifiers.new(f'Arch_{i}', 'BOOLEAN')
            boolean.object = cutter
            boolean.operation = 'DIFFERENCE'
            boolean.solver = 'EXACT'
            i += 1

    bevel = obj.modifiers.new('Bevel', 'BEVEL')
    bevel.width = 0.02
    bevel.segments = 2
    bevel.limit_method = 'ANGLE'
    bevel.angle_limit = math.radians(35)

    # A light subsurf rounds the panels into the smooth, organic curves a
    # real body has — the loft alone is too faceted straight off the ring
    # geometry, even with per-face smooth shading.
    subsurf = obj.modifiers.new('Subdivision', 'SUBSURF')
    subsurf.levels = 1
    subsurf.render_levels = 2

    for poly in obj.data.polygons:
        poly.use_smooth = True

    return obj


# ---------------------------------------------------------------------
# Wheels — rim + tyre + brake disc/caliper, built once and instanced
# (linked-duplicate mesh data) at the four corners.
# ---------------------------------------------------------------------
def build_wheel_template():
    # Hub barrel plus a wider, thinner outer lip so the rim reads as a
    # deep-dish forged wheel rather than a flat disc.
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=32,
        radius1=WHEEL_RADIUS * 0.58, radius2=WHEEL_RADIUS * 0.58,
        depth=WHEEL_WIDTH * 0.62,
    )
    lip = bmesh.ops.create_cone(
        bm, cap_ends=False, cap_tris=False, segments=32,
        radius1=WHEEL_RADIUS * 0.60, radius2=WHEEL_RADIUS * 0.78,
        depth=WHEEL_WIDTH * 0.18,
    )
    for v in lip['verts']:
        v.co.z += WHEEL_WIDTH * 0.30
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
    hub_mesh = bpy.data.meshes.new('CX_Rim_Mesh')
    bm.to_mesh(hub_mesh)
    bm.free()
    return hub_mesh


def build_tyre_mesh():
    # A simple torus, axis along Y to match the wheel's rolling axis.
    # A modest minor radius keeps the sidewall low-profile — a wall of
    # rubber reads as an economy car, not a supercar.
    bpy.ops.mesh.primitive_torus_add(
        major_radius=WHEEL_RADIUS, minor_radius=WHEEL_WIDTH * 0.36,
        major_segments=32, minor_segments=14, location=(0, 0, 0),
    )
    tyre = bpy.context.active_object
    tyre.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    mesh = tyre.data.copy()
    bpy.data.objects.remove(tyre, do_unlink=True)
    return mesh


def build_spoke(rim_loc, angle_deg, tag, index, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=rim_loc)
    spoke = bpy.context.active_object
    spoke.name = f'Rim_Spoke_{tag}_{index}'
    spoke.scale = (WHEEL_RADIUS * 0.56, WHEEL_WIDTH * 0.30, 0.035)
    spoke.rotation_euler = (0, math.radians(angle_deg), math.radians(14))
    spoke.data.materials.append(material)
    return spoke


def build_wheels(materials):
    rim_mesh_src = build_wheel_template()
    tyre_mesh_src = build_tyre_mesh()

    corners = [
        ('FL', WHEEL_X_FRONT, WHEEL_TRACK_Y),
        ('FR', WHEEL_X_FRONT, -WHEEL_TRACK_Y),
        ('RL', WHEEL_X_REAR, WHEEL_TRACK_Y),
        ('RR', WHEEL_X_REAR, -WHEEL_TRACK_Y),
    ]
    for tag, x, y in corners:
        rim = bpy.data.objects.new(f'CX_Rim_{tag}', rim_mesh_src.copy())
        rim.location = (x, y, WHEEL_RADIUS)
        rim.data.materials.append(materials['rim'])
        bpy.context.collection.objects.link(rim)
        for i in range(8):
            build_spoke((x, y, WHEEL_RADIUS), i * 45, tag, i, materials['rim'])

        tyre = bpy.data.objects.new(f'CX_Tire_{tag}', tyre_mesh_src.copy())
        tyre.location = (x, y, WHEEL_RADIUS)
        tyre.data.materials.append(materials['tire'])
        bpy.context.collection.objects.link(tyre)

        inboard = y - 0.08 if y > 0 else y + 0.08
        disc = bpy.data.objects.new(f'Brake_{tag}', make_disc_mesh())
        disc.location = (x, inboard, WHEEL_RADIUS)
        disc.rotation_euler = (math.radians(90), 0, 0)
        disc.data.materials.append(materials['brake_disc'])
        bpy.context.collection.objects.link(disc)

        bpy.ops.mesh.primitive_cube_add(size=1, location=(x + 0.05, inboard, WHEEL_RADIUS + 0.14))
        caliper = bpy.context.active_object
        caliper.name = f'Brake_Caliper_{tag}'
        caliper.scale = (0.12, 0.05, 0.14)
        caliper.data.materials.append(materials['brake_caliper'])


def make_disc_mesh():
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=20,
        radius1=WHEEL_RADIUS * 0.5, radius2=WHEEL_RADIUS * 0.5, depth=0.03,
    )
    mesh = bpy.data.meshes.new('Brake_Disc_Mesh')
    bm.to_mesh(mesh)
    bm.free()
    return mesh


# ---------------------------------------------------------------------
# Glass, lights, mirrors — small hand-placed panels rather than a loft;
# these sit ON the body surface at fixed stations.
# ---------------------------------------------------------------------
def build_glass(materials):
    bm = bmesh.new()
    # Raked windshield: cowl edge up to the header rail above the driver's
    # eye line, one panel per side, mirrored.
    v0 = bm.verts.new((-0.95, 0.00, 0.64))   # base, centreline (cowl)
    v1 = bm.verts.new((-0.95, 0.56, 0.50))   # base, side
    v2 = bm.verts.new((-0.62, 0.46, 0.80))   # top, side (raked back)
    v3 = bm.verts.new((-0.62, 0.00, 0.86))   # top, centreline
    bm.faces.new((v0, v1, v2, v3))
    mesh = bpy.data.meshes.new('CX_Glass_Windshield_Mesh')
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('CX_Glass_Windshield', mesh)
    obj.data.materials.append(materials['glass'])
    mirror = obj.modifiers.new('Mirror', 'MIRROR')
    mirror.use_axis = (False, True, False)
    bpy.context.collection.objects.link(obj)


def build_lens(name, x, y, z, length_x, width_y, height_z, material):
    """A simple box part. Dimensions are named for the world axis they
    control (length = X = fore/aft, width = Y = left/right, height = Z =
    up/down) so a call site's intent is unambiguous."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (length_x, width_y, height_z)
    obj.data.materials.append(material)
    return obj


def build_lights(materials):
    # Oval lens clusters, recessed into the front fender — a rounded
    # teardrop headlamp reads far more like a real car than a flat strip.
    for tag, side in (('L', 1), ('R', -1)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=20, ring_count=12, location=(-2.06, side * 0.56, 0.24))
        lamp = bpy.context.active_object
        lamp.name = f'CX_Headlight_{tag}'
        lamp.scale = (0.09, 0.055, 0.045)
        lamp.rotation_euler = (0, 0, side * math.radians(20))
        lamp.data.materials.append(materials['headlight'])

    # Full-width light bar across the tail — two segments meeting near
    # the centreline for one continuous strip, a distinctive CX signature.
    for tag, side in (('L', 1), ('R', -1)):
        build_lens(f'CX_Taillight_{tag}', 2.02, side * 0.24, 0.40, length_x=0.03, width_y=0.42, height_z=0.045, material=materials['taillight'])


def build_mirrors(materials):
    for tag, side in (('L', 1), ('R', -1)):
        y = side * 0.62
        build_lens(f'CX_Mirror_Stalk_{tag}', -0.62, side * 0.52, 0.60, length_x=0.025, width_y=0.025, height_z=0.14, material=materials['interior'])
        pod = build_lens(f'CX_Mirror_{tag}', -0.66, y, 0.70, length_x=0.14, width_y=0.06, height_z=0.05, material=materials['body_paint'])
        pod.rotation_euler = (0, 0, side * math.radians(-12))


# ---------------------------------------------------------------------
# Interior — dashboard, seats, steering wheel. Simple forms; visible
# through the open cockpit and over the low windshield.
# ---------------------------------------------------------------------
def build_interior(materials):
    build_lens('CX_Dash', -0.90, 0.0, 0.52, length_x=0.12, width_y=0.64, height_z=0.10, material=materials['interior'])
    # Digital instrument cluster — a small flat emissive panel recessed
    # into the dash, ahead of the steering wheel.
    build_lens('Instrument_Cluster', -0.86, 0.0, 0.58, length_x=0.01, width_y=0.18, height_z=0.06, material=materials['screen'])
    # Centre console running back between the seats.
    build_lens('Centre_Console', -0.35, 0.0, 0.38, length_x=0.55, width_y=0.10, height_z=0.10, material=materials['interior'])

    for tag, y in (('L', 0.24), ('R', -0.24)):
        build_lens(f'CX_Seat_{tag}', -0.25, y, 0.36, length_x=0.30, width_y=0.22, height_z=0.10, material=materials['interior'])
        build_lens(f'CX_SeatBack_{tag}', -0.48, y, 0.54, length_x=0.07, width_y=0.22, height_z=0.24, material=materials['interior'])
        build_lens(f'CX_SeatBolster_{tag}_A', -0.25, y - (0.13 if tag == 'L' else -0.13), 0.40, length_x=0.30, width_y=0.05, height_z=0.16, material=materials['interior'])

    bpy.ops.mesh.primitive_torus_add(major_radius=0.14, minor_radius=0.016, major_segments=20, minor_segments=8, location=(-1.05, 0.0, 0.60))
    wheel = bpy.context.active_object
    wheel.name = 'SteeringWheel'
    wheel.rotation_euler = (0, math.radians(25), 0)
    wheel.data.materials.append(materials['interior'])


# ---------------------------------------------------------------------
# Toggle-only accessories — spoiler, wide side skirts, exhaust. Modeled
# once, hidden by default; CxCarModel.tsx flips `.visible` per part
# based on the vehicle's `customization` object instead of building any
# geometry at runtime.
# ---------------------------------------------------------------------
def build_spoiler(materials):
    bm = bmesh.new()
    half_span = 0.70
    v = [
        bm.verts.new((1.92, -half_span, 0.92)), bm.verts.new((1.92, half_span, 0.92)),
        bm.verts.new((2.06, half_span, 0.95)), bm.verts.new((2.06, -half_span, 0.95)),
        bm.verts.new((1.78, -half_span, 0.86)), bm.verts.new((1.78, half_span, 0.86)),
    ]
    bm.faces.new((v[0], v[1], v[2], v[3]))
    bm.faces.new((v[4], v[5], v[1], v[0]))
    mesh = bpy.data.meshes.new('Spoiler_Mesh')
    bm.to_mesh(mesh)
    bm.free()
    wing = bpy.data.objects.new('Spoiler', mesh)
    wing.data.materials.append(materials['carbon'])
    bpy.context.collection.objects.link(wing)

    for side in (1, -1):
        strut = build_lens('Spoiler_Strut', 1.86, side * 0.42, 0.80, length_x=0.05, width_y=0.05, height_z=0.18, material=materials['body_paint'])
        strut.parent = wing

    return wing


def build_side_skirts(materials):
    for side, tag in ((1, 'L'), (-1, 'R')):
        build_lens(f'Side_Skirt_Wide_{tag}', -0.05, side * 0.94, 0.16, length_x=2.20, width_y=0.10, height_z=0.09, material=materials['carbon'])


def build_exhaust(materials):
    obj = bpy.data.objects.new('Exhaust', bpy.data.meshes.new('Exhaust_Mesh'))
    bpy.context.collection.objects.link(obj)
    for side in (1, -1):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.055, depth=0.16, location=(2.24, side * 0.22, 0.16))
        pipe = bpy.context.active_object
        pipe.name = f'Exhaust_Pipe_{"L" if side > 0 else "R"}'
        pipe.rotation_euler = (0, math.radians(90), 0)
        pipe.data.materials.append(materials['chrome'])
        pipe.parent = obj

    build_lens('Diffuser', 2.10, 0.0, 0.09, length_x=0.24, width_y=0.86, height_z=0.03, material=materials['carbon'])
    for i, side in enumerate((-0.6, -0.3, 0, 0.3, 0.6)):
        build_lens(f'Diffuser_Fin_{i}', 2.10, side * 0.80, 0.13, length_x=0.24, width_y=0.012, height_z=0.06, material=materials['carbon'])


# ---------------------------------------------------------------------
# Lighting + camera rig for preview renders only.
# ---------------------------------------------------------------------
def setup_studio():
    key = bpy.data.lights.new('Key', 'AREA')
    key.energy = 900
    key.size = 3
    key_obj = bpy.data.objects.new('Key', key)
    key_obj.location = (2, -4, 3)
    key_obj.rotation_euler = (math.radians(60), 0, math.radians(-25))
    bpy.context.collection.objects.link(key_obj)

    fill = bpy.data.lights.new('Fill', 'AREA')
    fill.energy = 300
    fill.size = 4
    fill_obj = bpy.data.objects.new('Fill', fill)
    fill_obj.location = (-3, -2, 2)
    fill_obj.rotation_euler = (math.radians(70), 0, math.radians(35))
    bpy.context.collection.objects.link(fill_obj)

    rim = bpy.data.lights.new('Rim', 'AREA')
    rim.energy = 500
    rim.size = 2
    rim_obj = bpy.data.objects.new('Rim', rim)
    rim_obj.location = (0, 3, 2)
    rim_obj.rotation_euler = (math.radians(110), 0, 0)
    bpy.context.collection.objects.link(rim_obj)

    floor_mesh = bpy.data.meshes.new('Floor')
    floor = bpy.data.objects.new('Floor', floor_mesh)
    bpy.context.collection.objects.link(floor)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6)
    bm.to_mesh(floor_mesh)
    bm.free()
    mat = bpy.data.materials.new('FloorMat')
    mat.diffuse_color = (0.03, 0.03, 0.035, 1)
    floor.data.materials.append(mat)

    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('World')
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.02, 0.02, 0.025, 1)
    bg.inputs[1].default_value = 0.6


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def render_view(name, cam_loc, target=(0, 0, 0.35), ortho=False, ortho_scale=4.5, lens=50, top=False):
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new(name)
    if ortho:
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = ortho_scale
    else:
        cam_data.lens = lens
    cam_obj = bpy.data.objects.new(name, cam_data)
    cam_obj.location = cam_loc
    bpy.context.collection.objects.link(cam_obj)
    if top:
        cam_obj.rotation_euler = (0, 0, 0)
    else:
        look_at(cam_obj, target)
    scene.camera = cam_obj

    scene.render.resolution_x = 900
    scene.render.resolution_y = 600
    scene.render.filepath = RENDER_DIR + name + '.png'
    bpy.ops.render.render(write_still=True)

    bpy.data.objects.remove(cam_obj, do_unlink=True)


def preview_renders():
    setup_studio()
    target = (0, 0, 0.4)
    render_view('side', (0, -9, 0.35), target=target, ortho=True, ortho_scale=5.6)
    render_view('front', (-9, 0, 0.35), target=target, ortho=True, ortho_scale=2.8)
    render_view('rear', (9, 0, 0.35), target=target, ortho=True, ortho_scale=2.8)
    render_view('three_quarter_front', (-5.4, -5.8, 1.8), target=(0.2, 0, 0.35))
    render_view('three_quarter_rear', (5.4, 5.8, 1.8), target=(-0.2, 0, 0.35))
    render_view('top', (0, 0, 9), ortho=True, ortho_scale=5.6, top=True)


# ---------------------------------------------------------------------
# Materials — Principled BSDF, PBR-correct, named to match what
# CxCarModel.tsx overrides per customization at runtime. Blender-side
# values are just sane defaults; Three.js is the source of truth for
# paint/wheel/glass/light finishes once a player customizes.
# ---------------------------------------------------------------------
def make_material(name, color, metallic=0.5, roughness=0.4, transmission=0.0, emission=None, emission_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if transmission:
        bsdf.inputs['Transmission Weight'].default_value = transmission
    if emission:
        bsdf.inputs['Emission Color'].default_value = emission
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    return m


def build_materials():
    return {
        'body_paint': make_material('Body_Paint', (0.55, 0.56, 0.60, 1), metallic=0.7, roughness=0.22),
        'rim': make_material('Rim', (0.72, 0.73, 0.75, 1), metallic=0.85, roughness=0.28),
        'tire': make_material('Tire', (0.02, 0.02, 0.02, 1), metallic=0.0, roughness=0.85),
        'glass': make_material('Glass', (0.05, 0.09, 0.08, 1), metallic=0.0, roughness=0.05, transmission=0.95),
        'headlight': make_material('Headlight', (1, 1, 1, 1), metallic=0.0, roughness=0.4, emission=(1, 1, 0.95, 1), emission_strength=3.0),
        'taillight': make_material('Taillight', (0.4, 0.02, 0.02, 1), metallic=0.0, roughness=0.4, emission=(1, 0.05, 0.05, 1), emission_strength=2.2),
        'interior': make_material('Interior', (0.08, 0.08, 0.09, 1), metallic=0.0, roughness=0.6),
        'brake_disc': make_material('Brake_Disc', (0.35, 0.35, 0.37, 1), metallic=0.8, roughness=0.4),
        'brake_caliper': make_material('Brake_Caliper', (0.6, 0.08, 0.06, 1), metallic=0.3, roughness=0.35),
        'chrome': make_material('Chrome', (0.8, 0.8, 0.82, 1), metallic=1.0, roughness=0.08),
        'carbon': make_material('Carbon_Fiber', (0.05, 0.05, 0.06, 1), metallic=0.15, roughness=0.35),
        'screen': make_material('Screen', (0.02, 0.02, 0.03, 1), metallic=0.0, roughness=0.3, emission=(0.3, 0.7, 1.0, 1), emission_strength=1.2),
    }


def build_all(materials):
    body = build_body()
    body.data.materials.append(materials['body_paint'])
    build_wheels(materials)
    build_glass(materials)
    build_lights(materials)
    build_mirrors(materials)
    build_interior(materials)
    build_spoiler(materials)
    build_side_skirts(materials)
    build_exhaust(materials)
    return body


def export_glb():
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format='GLB',
        use_selection=False,
        use_visible=True,
        export_apply=True,
        export_materials='EXPORT',
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )
    print(f'Exported: {OUT_GLB}')


def main():
    clean_scene()
    if mode == 'preview':
        build_body()
        preview_renders()
        return

    materials = build_materials()
    build_all(materials)

    if mode == 'full':
        preview_renders()
    elif mode == 'export':
        export_glb()
    elif mode == 'both':
        preview_renders()
        export_glb()


if __name__ == '__main__':
    main()
