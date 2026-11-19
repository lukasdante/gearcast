"""
Final-effluent discharge outfall: DN200 pipe with an electromagnetic flow meter and sampling tap,
cast-in concrete headwall with wing walls, flap valve on the outlet, stone (rip-rap) apron and a
short lined channel, plus a composite-sampler cabinet with status lamp.

Blender space: Z up, effluent arrives from -X and leaves along +X.
Run:  blender -b --factory-startup --python app/models-src/discharge.py
"""
import os
import sys
import math
import random
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import cyl, box, lathe, loft, join, bevel, set_mat, port, finalize, reset, rod, pipe_path, PI  # noqa: E402
import parts  # noqa: E402

ZP = 0.45      # pipe axis height


def build():
    reset()
    rnd = random.Random(7)
    # headwall + wing walls (splayed), with a pipe opening
    head = box(0.30, 1.6, 1.0, (0.0, 0, 0.5), 'concrete')
    hole = cyl(0.13, 0.6, (0.0, 0, ZP), 'X', 'concrete', verts=24)
    lib.boolean(head, hole)
    wings = []
    for sy in (-1, 1):
        w = box(0.9, 0.22, 0.7, (0.42, sy * 0.85, 0.35), 'concrete')
        w.rotation_euler = (0, 0, sy * math.radians(18))
        lib.apply_xf(w)
        wings.append(w)
    cap = box(0.38, 1.7, 0.06, (0.0, 0, 1.03), 'concrete2', bevel=0.01)
    hw = join([head, cap] + wings, 'BODY_headwall')
    bevel(hw, 0.015, 1, 50)
    set_mat(hw, 'concrete')

    # pipe in from -X with mag-flow meter + sample tap, through the headwall
    pipe = pipe_path([(-1.6, 0, ZP), (0.18, 0, ZP)], 0.11, mat='galv', name='p')
    fl_in = parts.flange_pair((-1.6, 0, ZP), (1, 0, 0), 0.11)
    meter_body = lathe([(0.0, -0.16), (0.19, -0.16), (0.19, -0.13), (0.15, -0.12), (0.15, 0.12), (0.19, 0.13),
                        (0.19, 0.16), (0.0, 0.16)], mat='marker', steps=24, name='mb')
    meter_body = parts._orient(meter_body, (-1.0, 0, ZP), (1, 0, 0))
    neck = cyl(0.04, 0.16, (-1.0, 0, ZP + 0.22), 'Z', 'marker', verts=12)
    head_tx = cyl(0.09, 0.08, (-1.0, 0, ZP + 0.34), 'Y', 'pump', verts=20)
    display = cyl(0.06, 0.01, (-1.0, -0.045, ZP + 0.34), 'Y', 'window', verts=20)
    meter = join([meter_body, neck, head_tx, display], 'BODY_flowmeter')
    tap = join([cyl(0.015, 0.12, (-0.55, 0, ZP + 0.16), 'Z', 'stainless', verts=8),
                cyl(0.03, 0.04, (-0.55, 0, ZP + 0.22), 'Z', 'safety', verts=8)], 'tap')
    sup = join([box(0.08, 0.30, ZP - 0.11, (x, 0, (ZP - 0.11) / 2), 'frame') for x in (-1.35, -0.55)], 'supports')
    pipes = join([pipe, fl_in, tap], 'pipes')

    # flap valve on the outlet face
    seat = lathe([(0.10, 0.0), (0.18, 0.0), (0.18, 0.03), (0.10, 0.03)], mat='castiron', steps=24, name='seat')
    seat = parts._orient(seat, (0.18, 0, ZP), (1, 0, 0))
    flap = cyl(0.17, 0.025, (0.0, 0, 0), 'X', 'castiron', verts=24)
    flap.rotation_euler = (0, math.radians(-20), 0)
    flap.location = (0.24, 0, ZP - 0.02)
    lib.apply_xf(flap, location=True)
    hinge = cyl(0.02, 0.26, (0.22, 0, ZP + 0.19), 'Y', 'steel', verts=10)
    valve = join([seat, flap, hinge], 'BODY_flap')

    # apron slab + rip-rap stones + lined channel
    apron = loft([[(0.15, -0.9, 0.0), (1.9, -0.75, 0.0), (1.9, 0.75, 0.0), (0.15, 0.9, 0.0)],
                  [(0.15, -0.9, 0.08), (1.9, -0.75, 0.04), (1.9, 0.75, 0.04), (0.15, 0.9, 0.08)]], 'apron', 'concrete2')
    stones = []
    for i in range(46):
        x = rnd.uniform(0.35, 1.85)
        side = rnd.choice((-1, 1))
        y = side * rnd.uniform(0.35, 0.78)
        s = rnd.uniform(0.07, 0.15)
        st = lib.sphere(s, (x, y, 0.05 + s * 0.4), 'concrete', seg=6, rings=4,
                        scale=(rnd.uniform(0.8, 1.3), rnd.uniform(0.8, 1.3), rnd.uniform(0.5, 0.8)))
        st.rotation_euler = (0, 0, rnd.uniform(0, PI))
        stones.append(st)
    rip = join(stones, 'riprap')
    set_mat(rip, 'concrete2')
    chan = loft([[(0.3, -0.3, 0.08), (0.3, -0.22, 0.03), (0.3, 0.22, 0.03), (0.3, 0.3, 0.08)],
                 [(1.95, -0.3, 0.05), (1.95, -0.22, 0.005), (1.95, 0.22, 0.005), (1.95, 0.3, 0.05)]], 'chan',
                'concrete', cap_start=False, cap_end=False)
    ground = join([apron, chan], 'BODY_apron')
    set_mat(ground, 'concrete2')

    # effluent stream in the channel
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    w = bpy.context.object
    w.scale = (1.62, 0.42, 1)
    lib.apply_xf(w)
    w.rotation_euler = (0, math.radians(1.0), 0)
    w.location = (1.12, 0, 0)
    lib.apply_xf(w, location=True)
    lib.set_origin(w, (0, 0, 0.045))
    w.name = 'WATER_stream'
    set_mat(w, 'water')
    lib.EXTRA_META['water'] = {'min': 0.035, 'max': 0.06}

    # composite sampler cabinet + status lamp
    cab = box(0.45, 0.4, 0.95, (-0.55, -0.75, 0.55), 'plate', bevel=0.02)
    plinth = box(0.55, 0.5, 0.08, (-0.55, -0.75, 0.04), 'concrete2', bevel=0.01)
    door = box(0.01, 0.34, 0.6, (-0.55 - 0.226, -0.75, 0.62), 'marker', bevel=0.004)
    hose = lib.curve_tube([(-0.55, -0.55, 0.5), (-0.6, -0.35, 0.45), (-0.55, -0.12, ZP + 0.18), (-0.55, 0, ZP + 0.24)],
                          0.012, mat='rubber', res=6, bevel_res=0)
    sampler = join([cab, plinth, door, hose], 'BODY_sampler')
    lamp = lib.sphere(0.045, (-0.55, -0.75, 1.07), 'status', seg=14, rings=7, name='STATUS_LAMP')

    port('in', (-1.6, 0, ZP), (-1, 0, 0))
    port('out', (1.95, 0, 0.04), (1, 0, 0))
    return finalize('discharge', smooth_angle=35)


if __name__ == '__main__':
    lib.main_guard(build)
