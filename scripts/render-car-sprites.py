"""Renders the Live board's car sprite sheets with Blender (headless).

  /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/render-car-sprites.py -- OUT_DIR [STEP_DEG] [SIZE]

A procedural sedan is turned in STEP_DEG steps (default 15°) under a fixed,
raised camera — the same trick ride-hailing maps use: pre-rendered frames that
look 3D, picked by the car's heading. One transparent PNG per colour and angle
is written to OUT_DIR as `<colour>-<index>.png`; a sheet is assembled
separately (see scripts/build-car-sheets.py).
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/car-frames'
STEP = float(argv[1]) if len(argv) > 1 else 15.0
SIZE = int(argv[2]) if len(argv) > 2 else 256
ONLY = argv[3].split(',') if len(argv) > 3 else None
COLORS = {
    'black': (0.015, 0.016, 0.02, 1),
    'white': (0.92, 0.93, 0.95, 1),
    'navy': (0.035, 0.07, 0.17, 1),
}
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def principled(name, color, metallic=0.0, rough=0.4, coat=0.0, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    def put(key, value):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = value
    put('Base Color', color)
    put('Metallic', metallic)
    put('Roughness', rough)
    put('Coat Weight', coat)
    put('Coat Roughness', 0.05)
    if emission:
        put('Emission Color', emission)
        put('Emission Strength', strength)
    return m


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def roof_line(x):
    """Height of the top of the car along its length (boot, roof, bonnet)."""
    if x < -1.50:
        return lerp(0.80, 0.90, smooth((x + 2.30) / 0.8))
    if x < -0.80:
        return lerp(0.90, 1.42, smooth((x + 1.50) / 0.7))
    if x < 0.25:
        return 1.46 - 0.04 * ((x + 0.25) / 0.5) ** 2 * 0.3
    if x < 1.05:
        return lerp(1.44, 0.93, smooth((x - 0.25) / 0.8))
    return lerp(0.93, 0.62, smooth((x - 1.05) / 1.25))


def half_width(x):
    """Plan-view outline: full in the middle, tucked at the nose and tail, narrower through the greenhouse."""
    t = abs(x) / 2.3
    base = 0.95 * (1 - 0.34 * t ** 2.6)
    cabin = smooth((roof_line(x) - 0.98) / 0.45)
    return base * (1 - 0.20 * cabin)


def loft_car(paint, glass):
    """One smooth shell from superellipse cross-sections; glass and roof are assigned by face position."""
    mesh = bpy.data.meshes.new('car')
    obj = bpy.data.objects.new('car', mesh)
    scene.collection.objects.link(obj)
    bm = bmesh.new()
    stations = [-2.3 + 4.6 * i / 28 for i in range(29)]
    M = 24
    P = 3.2
    rings = []
    for x in stations:
        w = half_width(x)
        zt = roof_line(x)
        zb = 0.30
        # round the very ends off
        end = smooth((2.3 - abs(x)) / 0.22)
        w *= 0.35 + 0.65 * end
        zt = zb + (zt - zb) * (0.5 + 0.5 * end)
        zc = (zb + zt) / 2
        h = (zt - zb) / 2
        ring = []
        for k in range(M):
            phi = 2 * math.pi * k / M
            c, sn = math.cos(phi), math.sin(phi)
            y = w * math.copysign(abs(c) ** (2 / P), c)
            z = zc + h * math.copysign(abs(sn) ** (2 / P), sn)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(M):
            k2 = (k + 1) % M
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.faces.ensure_lookup_table()
    for f in bm.faces:
        c = f.calc_center_median()
        n = f.normal
        if c.z > 1.00 and abs(n.z) < 0.8 and abs(c.x) < 1.35:
            f.material_index = 1          # windscreen, side and rear glass
        elif c.z > 0.97 and abs(c.x) < 1.2 and c.z > 1.36 and n.z > 0.8:
            f.material_index = 0          # roof panel
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(paint)
    obj.data.materials.append(glass)
    sub = obj.modifiers.new('sub', 'SUBSURF')
    sub.levels = 2
    sub.render_levels = 3
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    return obj


def box(name, loc, scale, mat):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.data.materials.append(mat)
    return o


def build_car(body_color):
    paint = principled('paint', body_color, metallic=0.3, rough=0.22, coat=1.0)
    glass = principled('glass', (0.012, 0.016, 0.026, 1), metallic=0.3, rough=0.05)
    tyre = principled('tyre', (0.012, 0.012, 0.014, 1), rough=0.85)
    rim = principled('rim', (0.62, 0.64, 0.68, 1), metallic=1.0, rough=0.3)
    head = principled('head', (1, 1, 1, 1), emission=(1, 0.96, 0.82, 1), strength=2.2)
    tail = principled('tail', (0.5, 0.01, 0.005, 1), emission=(1, 0.03, 0.015, 1), strength=1.4)
    loft_car(paint, glass)
    # wheels tucked under the arches
    for x in (-1.42, 1.38):
        for y in (-0.80, 0.80):
            bpy.ops.mesh.primitive_cylinder_add(radius=0.36, depth=0.30, location=(x, y, 0.36), rotation=(math.pi / 2, 0, 0), vertices=32)
            w = bpy.context.active_object
            w.data.materials.append(tyre)
            bpy.ops.object.shade_smooth()
            bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.32, location=(x, y * 1.02, 0.36), rotation=(math.pi / 2, 0, 0), vertices=24)
            bpy.context.active_object.data.materials.append(rim)
    # lamps
    for y in (-0.5, 0.5):
        box('head', (2.10, y, 0.585), (0.05, 0.19, 0.05), head)
    box('tail', (-2.10, 0, 0.78), (0.035, 0.56, 0.035), tail)


def clear_car():
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name != 'ground':
            bpy.data.objects.remove(o, do_unlink=True)


# --- scene ---------------------------------------------------------------
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = SIZE
scene.render.resolution_y = SIZE
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'

# ground that only catches the shadow
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
ground = bpy.context.active_object
ground.name = 'ground'
ground.is_shadow_catcher = True

# world: a soft, neutral ambient
world = bpy.data.worlds.new('w')
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.82, 0.85, 0.9, 1)
bg.inputs['Strength'].default_value = 0.85
scene.world = world

sun = bpy.data.lights.new('sun', 'SUN')
sun.energy = 3.2
sun.angle = math.radians(14)
sun_obj = bpy.data.objects.new('sun', sun)
sun_obj.rotation_euler = (math.radians(48), 0, math.radians(35))
scene.collection.objects.link(sun_obj)

# camera: fixed, raised, looking north — the car turns under it
el = math.radians(66)
dist = 15.0
cam_data = bpy.data.cameras.new('cam')
cam_data.lens = 62
cam = bpy.data.objects.new('cam', cam_data)
cam.location = (0, -dist * math.cos(el), dist * math.sin(el) + 0.5)
direction = Vector((0, 0, 0.55)) - cam.location
cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
scene.collection.objects.link(cam)
scene.camera = cam

frames = int(round(360 / STEP))
for name, color in COLORS.items():
    if ONLY and name not in ONLY:
        continue
    clear_car()
    build_car(color)
    # parent everything to an empty so the whole car turns together
    pivot = bpy.data.objects.new('pivot', None)
    scene.collection.objects.link(pivot)
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name != 'ground':
            o.parent = pivot
    for k in range(frames):
        bearing = k * STEP  # clockwise from north
        pivot.rotation_euler = (0, 0, math.radians(90 - bearing))
        scene.render.filepath = os.path.join(OUT, f'{name}-{k:02d}.png')
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(pivot, do_unlink=True)
print('DONE', OUT)
