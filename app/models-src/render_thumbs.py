"""Render a transparent 3/4-view snapshot of every GLB in public/models -> public/models/thumbs/<kind>.png.

  blender -b --factory-startup --python models-src/render_thumbs.py [-- kind ...]
"""
import bpy
import math
import os
import sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
SRC = os.path.join(APP, 'public', 'models')
OUT = os.path.join(SRC, 'thumbs')
SIZE = 640

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
kinds = argv or sorted(f[:-4] for f in os.listdir(SRC) if f.endswith('.glb'))
os.makedirs(OUT, exist_ok=True)


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs[0].default_value = (0.32, 0.36, 0.42, 1)
    bg.inputs[1].default_value = 0.55
    sc.world = world
    return sc


def add_sun(name, rot, energy, color=(1, 1, 1)):
    d = bpy.data.lights.new(name, 'SUN')
    d.energy = energy
    d.color = color
    d.angle = math.radians(4)
    o = bpy.data.objects.new(name, d)
    o.rotation_euler = [math.radians(a) for a in rot]
    bpy.context.scene.collection.objects.link(o)


for kind in kinds:
    sc = setup_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, kind + '.glb'))
    meshes = [o for o in sc.objects if o.type == 'MESH']
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (lo + hi) / 2
    radius = (hi - lo).length / 2

    add_sun('key', (50, 0, -35), 3.2, (1.0, 0.97, 0.92))
    add_sun('fill', (65, 0, 140), 0.9, (0.75, 0.85, 1.0))
    add_sun('rim', (25, 0, 200), 1.6)

    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 70
    cam = bpy.data.objects.new('cam', cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    # 3/4 view from the front-left (-Y is the front in Blender space), ~28 deg elevation
    yaw, pitch = math.radians(-38), math.radians(28)
    direction = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    fov = 2 * math.atan(cam_data.sensor_width / (2 * cam_data.lens))
    dist = radius / math.sin(fov / 2) * 1.04
    cam.location = center + direction * dist
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam_data.clip_end = dist * 4

    sc.render.filepath = os.path.join(OUT, kind + '.png')
    bpy.ops.render.render(write_still=True)
    print('THUMB', kind, sc.render.filepath)

# Tighten framing: crop to the visible pixels, pad 6%, square, 512px (Pillow via system python).
import subprocess  # noqa: E402
subprocess.run(['python3', '-c', '''
from PIL import Image
import glob, sys
for p in glob.glob(sys.argv[1] + "/*.png"):
    im = Image.open(p).convert("RGBA"); bb = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if not bb: continue
    c = im.crop(bb); w, h = c.size; s = max(w, h); pad = int(s * 0.06); S = s + 2 * pad
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0)); out.paste(c, ((S - w) // 2, (S - h) // 2))
    out.resize((512, 512), Image.LANCZOS).save(p, optimize=True)
''', OUT], check=False)
