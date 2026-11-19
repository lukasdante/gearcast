"""
Equalization tank: Ø5.0 m x 4.0 m open-top welded steel tank on a concrete ring foundation.

Parts: shell with plate-course seams, wind-girder stiffener rings and top curb angle, bolted manway,
inlet nozzle near the top (-X), outlet nozzle at the bottom (+X), overflow, ultrasonic level
transmitter on a bracket, diametral access bridge with grating and handrails, top-entry mixer
(gear motor fixed, shaft + hub ROTOR), caged access ladder with landing.

Blender space: Z up. WATER_surface origin at its own height; the wrapper drives it from `level`.
Run:  blender -b --factory-startup --python app/models-src/tank.py
"""
import os
import sys
import math
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import cyl, box, lathe, join, bevel, set_mat, rotor, port, finalize, reset, PI  # noqa: E402
import parts  # noqa: E402

R, H, T = 2.5, 4.0, 0.012
ZF = 0.20     # foundation ring height (tank floor)


def build():
    reset()
    found = lathe([(0.0, 0.0), (R + 0.18, 0.0), (R + 0.18, ZF - 0.02), (R + 0.16, ZF), (0.0, ZF)], mat='concrete',
                  steps=64, name='found')
    shell = lathe([(R, ZF), (R, ZF + H), (R - T, ZF + H), (R - T, ZF + 0.012), (0.0, ZF + 0.012)], mat='process',
                  steps=96, name='shell')
    seams = [lathe([(R, z - 0.006), (R + 0.004, z - 0.004), (R + 0.004, z + 0.004), (R, z + 0.006)], mat='process',
                   steps=96, name='seam') for z in (ZF + 1.0, ZF + 2.0, ZF + 3.0)]
    girders = [lathe([(R, z - 0.04), (R + 0.075, z - 0.04), (R + 0.075, z - 0.03), (R + 0.01, z - 0.03),
                      (R + 0.01, z + 0.04), (R, z + 0.04)], mat='process', steps=96, name='girder')
               for z in (ZF + 1.5, ZF + 3.0)]
    curb = lathe([(R - 0.08, ZF + H), (R + 0.08, ZF + H), (R + 0.08, ZF + H + 0.01), (R + 0.01, ZF + H + 0.01),
                  (R + 0.01, ZF + H + 0.08), (R - 0.0, ZF + H + 0.08)], mat='process', steps=96, name='curb')
    # bolted manway on the +Y side at the bottom course
    mw = lathe([(0.0, 0.0), (0.36, 0.0), (0.36, 0.05), (0.30, 0.07), (0.0, 0.07)], mat='process', steps=32,
               name='mw')
    mw.rotation_euler = (-PI / 2, 0, 0)
    mw.location = (0.8, R - 0.02, ZF + 0.65)
    lib.apply_xf(mw, location=True)
    mwb = lib.bolt_ring(16, 0.33, 'Y', (0.8, R + 0.055, ZF + 0.65), size=0.012, h=0.03, name='mwb')
    tank = join([shell] + seams + girders + [curb, mw], 'BODY_shell')
    found.name = 'BODY_foundation'
    band = lathe([(R + 0.001, ZF + H - 0.35), (R + 0.006, ZF + H - 0.35), (R + 0.006, ZF + H - 0.27),
                  (R + 0.001, ZF + H - 0.27)], mat='status', steps=96, name='STATUS_BAND')

    # nozzles
    nin = parts.nozzle((-R - 0.30, 0, ZF + H - 0.55), '-X', r=0.11, length=0.33, mat='process', name='n_in')
    nout = parts.nozzle((R + 0.30, 0, ZF + 0.45), 'X', r=0.11, length=0.33, mat='process', name='n_out')
    yo = 1.1
    xo = math.sqrt(R * R - yo * yo)
    novf = parts.nozzle((xo + 0.30, yo, ZF + H - 0.25), 'X', r=0.08, length=0.45, mat='process', name='n_ovf')
    ovf_down = lib.curve_tube([(xo + 0.30, yo, ZF + H - 0.25), (xo + 0.42, yo, ZF + H - 0.30),
                               (xo + 0.45, yo, ZF + H - 0.6), (xo + 0.45, yo, 0.35)], 0.08, mat='process',
                              name='ovf', res=6, bevel_res=2)
    nozzles = join([nin, nout, novf], 'nozzles')

    # access bridge along Y across the top + mixer at centre
    zb = ZF + H + 0.10
    bridge = parts.grating_walk(0, -R - 0.5, 0, R - 0.1, zb, width=0.9, name='walk', posts=5)
    girders2 = [box(0.10, 2 * R + 0.3, 0.20, (sx, -0.2, zb - 0.11), 'frame') for sx in (-0.5, 0.5)]
    landing_legs = [box(0.08, 0.08, zb, (sx, -R - 0.75, zb / 2), 'frame') for sx in (-0.5, 0.5)]
    landing = box(1.1, 0.6, 0.04, (0, -R - 0.5, zb), 'grating')
    walk = join([bridge, landing] + girders2 + landing_legs, 'BODY_bridge')
    ladder = parts.cage_ladder(0.0, -R - 1.05, 0.0, zb, (0, -1), mat='galv', name='ladder')

    # top-entry mixer: gear motor + lantern on the bridge, shaft and hub ROTOR
    base = box(0.5, 0.5, 0.03, (0, 0, zb + 0.05), 'frame')
    lantern = cyl(0.14, 0.35, (0, 0, zb + 0.24), 'Z', 'motor', verts=24)
    gearbox = box(0.38, 0.32, 0.26, (0, 0, zb + 0.52), 'motor', bevel=0.03)
    mot = cyl(0.13, 0.42, (0.0, 0.18, zb + 0.52 + 0.0), 'Y', 'motor', verts=24)
    mot.location.y = 0.37
    fan = cyl(0.135, 0.12, (0, 0.64, zb + 0.52), 'Y', 'motor2', verts=24)
    mixer = join([base, lantern, gearbox, mot, fan], 'BODY_mixer')
    lamp = lib.sphere(0.045, (0.17, -0.17, zb + 0.70), 'status', seg=14, rings=7, name='STATUS_LAMP')
    shaft = cyl(0.04, zb + 0.06 - 0.8, (0, 0, (zb + 0.06 + 0.8) / 2), 'Z', 'stainless', verts=12)
    coup = cyl(0.08, 0.10, (0, 0, zb + 0.12), 'Z', 'steel', verts=16)
    hub = cyl(0.09, 0.15, (0, 0, 0.85), 'Z', 'stainless', verts=16)
    blades = [box(0.70, 0.18, 0.012, (0.42 * math.cos(a), 0.42 * math.sin(a), 0.85), 'stainless',
                  rot=(0.45, 0, a)) for a in [i * 2 * PI / 3 for i in range(3)]]
    rot = join([shaft, coup, hub] + blades, 'ROTOR_mixer')
    rotor(rot, (0, 0, 0), 'Z', speed=3.0)

    # level transmitter on a bracket off the bridge
    lt = join([box(0.6, 0.06, 0.06, (0.75, 1.2, zb + 0.05), 'galv'),
               cyl(0.06, 0.18, (1.0, 1.2, zb - 0.03), 'Z', 'plate', verts=16),
               box(0.12, 0.10, 0.10, (1.0, 1.2, zb + 0.12), 'plate')], 'level_tx')
    hw = join([mwb, ovf_down], 'hardware')

    # liquid surface
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=R - T - 0.002, fill_type='TRIFAN', location=(0, 0, 0))
    w = bpy.context.object
    w.name = 'WATER_surface'
    set_mat(w, 'water')
    w.location = (0, 0, ZF + 0.7 * H)
    lib.EXTRA_META['water'] = {'min': ZF + 0.25, 'max': ZF + H - 0.3}

    port('in', (-R - 0.30, 0, ZF + H - 0.55), (-1, 0, 0))
    port('out', (R + 0.30, 0, ZF + 0.45), (1, 0, 0))
    return finalize('tank', smooth_angle=35)


if __name__ == '__main__':
    lib.main_guard(build)
