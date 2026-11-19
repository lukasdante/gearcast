"""
Linear vibrating screen (SZF-1020 type, 1000 x 2000 mm stainless mesh deck) on four coil-spring
mounts and a fabricated support frame, with two counter-rotating vibrator motors on the drive beam,
a feed box with DN150 inlet, an oversize discharge lip + solids chute, and an underflow collection
pan with a DN150 outlet to the EQ tank.

Reference: app/public/figures/FIG-04 (deck 1, springs 2, motors 3, solids chute 4, mesh 5) and FIG-05.

Blender space: Z up, flow along +X (feed at -X, oversize + screened-water outlet at +X).
The whole vibrating box is one SHAKE node (linear stroke at 45 deg to the deck).
Run:  blender -b --factory-startup --python app/models-src/vibrating_screen.py
"""
import os
import sys
import math
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import (cyl, box, lathe, loft, join, bevel, solidify, array, curve_tube, port, finalize, reset,
                 set_mat, PI)  # noqa: E402
from vib import vibrator_motor  # noqa: E402

TILT = math.radians(5.0)     # deck declined toward the discharge end
ZC = 1.0                     # deck centre height
L0, L1, HW = -1.05, 1.02, 0.52


def T(x, y, z):
    """box-local -> world (rotate about Y so +X end drops, then lift)."""
    c, s = math.cos(TILT), math.sin(TILT)
    return Vector((x * c + z * s, y, -x * s + z * c + ZC))


def side_plate(y0, t=0.012):
    prof = [(L0, -0.14), (L1, -0.14), (L1, 0.16), (0.05, 0.27), (0.0, 0.50), (-0.32, 0.50), (-0.38, 0.30),
            (L0, 0.30)]
    rings = [[(x, y, z) for x, z in prof] for y in (y0, y0 + t)]
    o = loft(rings, 'side', 'process')
    return o


def build():
    reset()
    shake = []

    # --- vibrating box -------------------------------------------------------------------
    for sy in (-1, 1):
        y0 = sy * HW if sy > 0 else -HW - 0.012
        plate = side_plate(y0)
        yo = sy * (HW + 0.012 + 0.025)      # outer face features
        # top edge stiffening lips and vertical stiffeners on the outer face
        lips = [box(L1 - 0.05 - L0, 0.05, 0.012, ((L0 + 0.05 + L1) / 2 - 0.0, yo, -0.14 + 0.006), 'process')]
        for x in (-0.85, -0.55, 0.35, 0.7):
            lips.append(box(0.012, 0.05, 0.40 if x < -0.4 else 0.30, (x, yo, 0.07 if x < -0.4 else 0.02), 'process'))
        # spring brackets
        for x in (-0.80, 0.80):
            lips.append(box(0.16, 0.13, 0.025, (x, sy * (HW + 0.075), -0.11), 'process', bevel=0.004))
            lips.append(box(0.012, 0.13, 0.12, (x - 0.074, sy * (HW + 0.075), -0.05), 'process'))
            lips.append(box(0.012, 0.13, 0.12, (x + 0.074, sy * (HW + 0.075), -0.05), 'process'))
        shake.append(bevel(join([plate] + lips, 'side'), 0.003, 1, 60))
    rear = box(0.012, 2 * HW, 0.44, (L0 + 0.006, 0, 0.08), 'process')
    baffle = box(0.010, 2 * HW, 0.16, (-0.80, 0, 0.17), 'process')
    feed_floor = box(0.25, 2 * HW, 0.01, (L0 + 0.125, 0, 0.0), 'process')
    feed = cyl(0.084, 0.22, (L0 - 0.10, 0, 0.17), 'X', 'process', verts=24)
    feed_fl = lathe([(0.0, 0.0), (0.142, 0.0), (0.142, 0.024), (0.0, 0.024)], loc=(L0 - 0.234, 0, 0.17), axis='X',
                    mat='process', steps=32, name='ffl')
    lip = box(0.16, 2 * HW, 0.010, (L1 + 0.07, 0, -0.02), 'process', rot=(0, math.radians(22), 0))
    # cross members under the deck
    tubes = [cyl(0.032, 2 * HW, (x, 0, -0.07), 'Y', 'process', verts=16) for x in (-0.65, -0.2, 0.25, 0.7)]
    # drive beam between the side-plate towers + gussets
    beam = box(0.26, 2 * HW + 0.024, 0.13, (-0.16, 0, 0.435), 'process', bevel=0.006)
    gus = [box(0.012, 2 * HW, 0.20, (x, 0, 0.30), 'process') for x in (-0.28, -0.04)]
    shake.append(join([rear, baffle, feed_floor, feed, feed_fl, lip, beam] + tubes + gus, 'box'))
    # deck mesh: woven stainless wires over the deck area + clamp rails
    wl = box(L1 - L0 - 0.27, 0.006, 0.006, ((L0 + 0.26 + L1) / 2, -HW + 0.02, 0.0), 'mesh')
    array(wl, 40, (0, (2 * HW - 0.04) / 39, 0))
    wt = box(0.006, 2 * HW, 0.006, (L0 + 0.27, 0, -0.006), 'mesh')
    array(wt, 72, ((L1 - L0 - 0.28) / 71, 0, 0))
    clamps = [box(L1 - L0 - 0.27, 0.04, 0.022, ((L0 + 0.26 + L1) / 2, y, 0.008), 'stainless') for y in (-HW + 0.02, 0, HW - 0.02)]
    deck = join([wl, wt] + clamps, 'deck')
    # vibrator motors on the drive beam (axes along Y, counter-rotating pair)
    for y in (-0.27, 0.27):
        m, h, _ = vibrator_motor(-0.16, y, 0.50, 'vm', length=0.40, paint='motor', steps=20)
        shake += [m, h]
    shake.append(deck)
    hw = [cyl(0.012, 0.03, (x, sy * (HW + 0.075), -0.09), 'Z', 'steel', verts=6)
          for x in (-0.84, -0.76, 0.76, 0.84) for sy in (-1, 1)]
    shake += hw
    box_obj = join(shake, 'SHAKE_box')
    box_obj.matrix_world = Matrix.Translation((0, 0, ZC)) @ Matrix.Rotation(TILT, 4, 'Y')
    lib.apply_xf(box_obj, location=True)
    stroke = Matrix.Rotation(TILT, 3, 'Y') @ Vector((1, 0, 1)).normalized()
    box_obj['dir'] = [round(stroke.x, 4), round(stroke.z, 4), round(-stroke.y, 4)]   # three.js axes
    box_obj['amp'] = 0.0035
    box_obj['freq'] = 8.0
    lib.set_origin(box_obj, T(0, 0, 0))

    # --- springs + support frame -----------------------------------------------------------
    springs, frame = [], []
    for x in (-0.80, 0.80):
        for sy in (-1, 1):
            top = T(x, sy * (HW + 0.075), -0.125)
            bot_z = top.z - 0.17
            pts = []
            turns, n = 4.5, 36
            for i in range(n + 1):
                a = 2 * PI * turns * i / n
                pts.append((top.x + 0.045 * math.cos(a), top.y + 0.045 * math.sin(a), bot_z + 0.01 + (top.z - bot_z - 0.02) * i / n))
            sp = curve_tube(pts, 0.009, mat='spring', name='spring', res=1, bevel_res=0)
            springs.append(sp)
            frame.append(box(0.15, 0.15, 0.016, (top.x, top.y, bot_z - 0.008), 'frame', bevel=0.003))
            frame.append(box(0.09, 0.09, bot_z - 0.016, (top.x, top.y, (bot_z - 0.016) / 2), 'frame', bevel=0.006))
            frame.append(box(0.18, 0.18, 0.014, (top.x, top.y, 0.007), 'frame', bevel=0.003))
    lx = T(0.8, 0, -0.125).x
    fx = T(-0.8, 0, -0.125).x
    ly = HW + 0.075
    for sy in (-1, 1):
        frame.append(box(lx - fx, 0.07, 0.10, ((lx + fx) / 2, sy * ly, 0.30), 'frame', bevel=0.004))
        # diagonal brace
        dz = 0.36
        ln = math.hypot(lx - fx - 0.1, dz)
        frame.append(box(ln, 0.012, 0.06, ((lx + fx) / 2, sy * (ly - 0.035), 0.55), 'frame',
                         rot=(0, -math.atan2(dz, lx - fx - 0.1), 0)))
    for x in (fx, lx):
        frame.append(box(0.07, 2 * ly, 0.10, (x, 0, 0.30), 'frame', bevel=0.004))
    # local isolator / control box with status lamp on the feed-end leg
    iso = box(0.22, 0.12, 0.30, (fx, -ly - 0.11, 0.95), 'plate', bevel=0.015)
    iso_h = cyl(0.02, 0.05, (fx, -ly - 0.19, 0.98), 'Y', 'safety', verts=10)
    iso_c = lib.curve_tube([(fx, -ly - 0.11, 0.80), (fx, -ly - 0.1, 0.72), (fx + 0.1, -ly - 0.02, 0.62)], 0.012,
                           mat='rubber', res=4, bevel_res=0)
    join([iso, iso_h, iso_c], 'isolator')
    lib.sphere(0.035, (fx, -ly - 0.11, 1.13), 'status', seg=14, rings=7, name='STATUS_LAMP')
    support = join(frame, 'BODY_support')
    spr = join(springs, 'springs')

    # --- underflow collection pan + DN150 outlet --------------------------------------------
    def rect(cx, hx, hy, z, n=4):
        pts = []
        for (ax, ay), (bx, by) in zip([(-1, -1), (1, -1), (1, 1), (-1, 1)], [(1, -1), (1, 1), (-1, 1), (-1, -1)]):
            for k in range(n):
                t = k / n
                pts.append((cx + hx * (ax + (bx - ax) * t), hy * (ay + (by - ay) * t), z))
        return pts
    ox = 0.45
    pan = loft([rect(ox, 0.13, 0.13, 0.42), rect(ox * 0.6, 0.65, 0.42, 0.55), rect(0.0, 1.0, 0.56, 0.70),
                rect(0.0, 1.02, 0.58, 0.74)], 'pan', 'galv', cap_start=False, cap_end=False)
    solidify(pan, 0.006)
    drain = cyl(0.084, 0.10, (ox, 0, 0.37), 'Z', 'galv', verts=24)
    Rb = 0.12
    rings = []
    for i in range(10):
        a = (PI / 2) * i / 9
        cx, cz = ox + Rb * (1 - math.cos(a)), 0.32 - Rb * math.sin(a)
        nx, nz = -math.cos(a), -math.sin(a)       # radial (in XZ) unit from the bend centre
        rings.append([(cx + nx * 0.084 * math.cos(t) * 1.0, 0.084 * math.sin(t), cz + nz * 0.084 * math.cos(t))
                      for t in [k * 2 * PI / 20 for k in range(20)]])
    elbow = loft(rings, 'elbow', 'galv', cap_start=False, cap_end=False)
    oz = 0.32 - Rb
    pipe = cyl(0.084, 1.30 - (ox + Rb), ((ox + Rb + 1.30) / 2, 0, oz), 'X', 'galv', verts=20)
    ofl = lathe([(0.06, 0.0), (0.142, 0.0), (0.142, 0.024), (0.06, 0.024)], loc=(1.30, 0, oz), axis='X',
                mat='galv', steps=32, name='ofl')
    pstand = box(0.06, 0.06, oz - 0.08, (1.1, 0, (oz - 0.08) / 2), 'frame')
    pan_stays = [box(0.04, 0.04, 0.32, (x, sy * 0.5, 0.55), 'frame') for x in (-0.7, 0.7) for sy in (-1, 1)]
    panj = join([pan, drain, elbow, pipe, ofl, pstand] + pan_stays, 'BODY_pan')

    # solids chute (fixed) under the discharge lip
    lipw = T(L1 + 0.14, 0, -0.06)
    ch_len = 0.55
    ang = math.radians(50)
    chute_floor = box(ch_len, 2 * HW - 0.06, 0.008, (0, 0, 0), 'galv')
    walls = [box(ch_len, 0.008, 0.20, (0, sy * (HW - 0.03), 0.10), 'galv') for sy in (-1, 1)]
    chute = join([chute_floor] + walls, 'BODY_chute')
    chute.matrix_world = Matrix.Translation((lipw.x + 0.02 + ch_len / 2 * math.cos(ang), 0,
                                             lipw.z - 0.06 - ch_len / 2 * math.sin(ang))) @ Matrix.Rotation(ang, 4, 'Y')
    lib.apply_xf(chute, location=True)
    legs = [box(0.05, 0.05, 0.42, (lipw.x + 0.30, sy * (HW - 0.05), 0.21), 'frame') for sy in (-1, 1)]
    join(legs, 'chute_legs')

    port('in', tuple(T(L0 - 0.234, 0, 0.17)), (-1, 0, 0))
    port('out', (1.324, 0, oz), (1, 0, 0))
    return finalize('vibrating_screen')


if __name__ == '__main__':
    lib.main_guard(build)
