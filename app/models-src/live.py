#!/usr/bin/env python3
"""Build a kind inside the live Blender GUI ('GearCast' scene only) and grab a viewport screenshot.

  python3 live.py <kind> [out.png] [distance] [yaw_deg] [pitch_deg] [shading]
"""
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_live import call  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

kind = sys.argv[1]
out = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else None
dist = float(sys.argv[3]) if len(sys.argv) > 3 else 0
yaw = float(sys.argv[4]) if len(sys.argv) > 4 else -35
pitch = float(sys.argv[5]) if len(sys.argv) > 5 else 62
shading = sys.argv[6] if len(sys.argv) > 6 else 'MATERIAL'

code = f'''
import sys, importlib, math, bpy
from mathutils import Euler, Vector
sys.path.insert(0, {HERE!r})
import lib; importlib.reload(lib)
import {kind} as K; importlib.reload(K)
K.build()
sc = bpy.data.scenes['GearCast']
meshes = [o for o in sc.objects if o.type == 'MESH']
lo = Vector((1e9,)*3); hi = Vector((-1e9,)*3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
ctr = (lo + hi) / 2
for win in bpy.context.window_manager.windows:
    if win.scene.name != 'GearCast':
        continue
    for area in win.screen.areas:
        if area.type == 'VIEW_3D':
            sp = area.spaces.active
            sp.shading.type = {shading!r}
            sp.overlay.show_floor = False
            sp.overlay.show_axis_x = sp.overlay.show_axis_y = False
            r3 = sp.region_3d
            r3.view_perspective = 'PERSP'
            r3.view_location = ctr
            r3.view_distance = {dist} or (hi - lo).length * 1.25
            r3.view_rotation = Euler((math.radians({pitch}), 0, math.radians({yaw})), 'XYZ').to_quaternion()
'''
r = call('execute_code', {'code': code})
res = r.get('result', r)
txt = json.dumps(res)
print(txt[-3000:])
if out:
    print(call('get_viewport_screenshot', {'filepath': out, 'format': 'png', 'max_size': 1100}))
