"""
End-suction centrifugal pump, back-pull-out type (KSB Sewatec K 080-250 class: DN100 suction,
DN80 discharge, Ø250 impeller, ~50 m3/h @ 22 m, 1750 rpm), on a fabricated baseplate.

Reference: app/public/figures/FIG-01 (volute 1, discharge 2, casing cover 5, bearing bracket 9-12,
coupling 13). The motor is a separate asset (motor.py) that lines up on the same 0.36 m shaft axis.

Blender space: Z up, shaft along +X, suction (inlet) on -X, discharge nozzle vertical on top.
Run:  blender -b --factory-startup --python app/models-src/pump_end_suction.py
"""
import os
import sys
import math
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import (cyl, box, lathe, loft, bolt_ring, boolean, join, solidify, bevel, rotor, port,
                 finalize, reset, set_mat, PI)  # noqa: E402

H = 0.36          # shaft axis height above ground
BASE_TOP = 0.085  # baseplate deck height


def superellipse(n, a, b, e=0.55):
    pts = []
    for k in range(n):
        t = 2 * PI * k / n
        c, s = math.cos(t), math.sin(t)
        pts.append((a * math.copysign(abs(c) ** e, c), b * math.copysign(abs(s) ** e, s)))
    return pts


def volute():
    """Spiral scroll swept from the cutwater through 360 deg, growing in section, then running
    tangentially straight up into the discharge nozzle (tangential top discharge)."""
    N = 20
    rings = []
    phi0 = 0.42                      # cutwater (tongue) angle
    steps = 40
    R0, R1 = 0.150, 0.198            # centreline radius of the scroll
    s0, s1 = 0.030, 0.072            # radial half-depth of the section
    w0, w1 = 0.045, 0.074            # axial half-width
    for i in range(steps + 1):
        t = i / steps
        phi = phi0 + (2 * PI - phi0) * t
        rc = R0 + (R1 - R0) * t
        s = s0 + (s1 - s0) * t
        w = w0 + (w1 - w0) * t
        uy, uz = -math.cos(phi), math.sin(phi)          # radial unit in the YZ plane
        cy, cz = rc * uy, rc * uz
        ring = [(ax, cy + uy * rd, H + cz + uz * rd) for rd, ax in superellipse(N, s, w)]
        rings.append(ring)
    # diffuser / discharge nozzle: blend scroll section into the DN80 round nozzle, straight up
    yc = -R1
    rn = 0.052
    for j, (z, k) in enumerate([(0.05, 0.25), (0.11, 0.6), (0.17, 0.9), (0.24, 1.0), (0.29, 1.0)]):
        a = s1 + (rn - s1) * k
        b = w1 + (rn - w1) * k
        e = 0.55 + 0.45 * k
        rings.append([(ax, yc - rd, H + z) for rd, ax in superellipse(N, a, b, e)])
    o = loft(rings, 'BODY_volute', 'pump', cap_start=True, cap_end=True)
    return o


def build():
    reset()
    parts = []

    # --- casing: volute scroll + suction-side shroud and suction nozzle (lathe) -------------
    vol = volute()
    front = lathe([(0.0, -0.215), (0.046, -0.215), (0.046, -0.300), (0.064, -0.300), (0.064, -0.215),
                   (0.070, -0.14), (0.095, -0.090), (0.140, -0.062), (0.162, -0.035), (0.166, 0.0),
                   (0.160, 0.050), (0.0, 0.050)],
                  loc=(0, 0, H), axis='X', mat='pump', steps=40, name='front')
    # suction flange DN100 (OD 220, 8 x M16 on PCD 180)
    sflange = lathe([(0.046, -0.322), (0.110, -0.322), (0.112, -0.318), (0.112, -0.302), (0.068, -0.296),
                     (0.046, -0.296)], loc=(0, 0, H), axis='X', mat='pump', steps=40, name='sflange')
    # bolt holes through the suction flange
    holes = [cyl(0.0095, 0.06, (-0.31, 0.090 * math.cos(a), H + 0.090 * math.sin(a)), 'X', verts=12)
             for a in [PI / 8 + i * PI / 4 for i in range(8)]]
    boolean(sflange, holes)
    # discharge flange DN80 (OD 200, 8 x M16 on PCD 160)
    dz = H + 0.29
    dflange = lathe([(0.040, 0.0), (0.100, 0.0), (0.102, 0.004), (0.102, 0.020), (0.098, 0.024),
                     (0.040, 0.024)], loc=(0, -0.198, dz), axis='Z', mat='pump', steps=40, name='dflange')
    holes = [cyl(0.0095, 0.06, (0.080 * math.cos(a), -0.198 + 0.080 * math.sin(a), dz + 0.012), 'Z', verts=12)
             for a in [PI / 8 + i * PI / 4 for i in range(8)]]
    boolean(dflange, holes)
    # casing feet (cast) under the volute
    feet = []
    for sy in (-1, 1):
        f = box(0.11, 0.07, 0.10, (0.0, sy * 0.115, BASE_TOP + 0.05), 'pump', bevel=0.008)
        feet.append(f)
        feet.append(box(0.15, 0.10, 0.018, (0.0, sy * 0.13, BASE_TOP + 0.009), 'pump', bevel=0.004))
    # drain plug at the bottom of the scroll, and vent plug at the top
    feet.append(cyl(0.014, 0.03, (0.0, 0.0, H - 0.262), 'Z', 'pump', verts=6))
    casing = join([vol, front, sflange, dflange] + feet, 'BODY_casing')
    bevel(casing, 0.004, 1, 50)

    # suction / discharge bore darkness
    bores = join([cyl(0.046, 0.004, (-0.22, 0, H), 'X', 'dark', verts=32),
                  cyl(0.040, 0.004, (0, -0.198, dz + 0.010), 'Z', 'dark', verts=32)], 'bores')
    set_mat(bores, 'dark')

    # flange studs + nuts
    studs = []
    for i in range(8):
        a = PI / 8 + i * PI / 4
        studs.append(cyl(0.008, 0.07, (-0.318, 0.090 * math.cos(a), H + 0.090 * math.sin(a)), 'X', 'steel', verts=8))
        studs.append(cyl(0.014, 0.014, (-0.330, 0.090 * math.cos(a), H + 0.090 * math.sin(a)), 'X', 'steel', verts=6))
        studs.append(cyl(0.008, 0.06, (0.080 * math.cos(a), -0.198 + 0.080 * math.sin(a), dz + 0.02), 'Z', 'steel', verts=8))
        studs.append(cyl(0.014, 0.014, (0.080 * math.cos(a), -0.198 + 0.080 * math.sin(a), dz + 0.031), 'Z', 'steel', verts=6))

    # --- casing cover + bearing bracket (lantern with seal access windows) -----------------
    cover = lathe([(0.0, 0.055), (0.228, 0.055), (0.232, 0.060), (0.232, 0.082), (0.226, 0.088),
                   (0.150, 0.090), (0.0, 0.090)], loc=(0, 0, H), axis='X', mat='pump2', steps=48, name='BODY_cover')
    studs.append(bolt_ring(16, 0.212, 'X', (0.092, 0, H), size=0.011, h=0.018, name='coverbolts'))
    lantern = lathe([(0.150, 0.088), (0.150, 0.110), (0.105, 0.205), (0.100, 0.215)],
                    loc=(0, 0, H), axis='X', mat='pump2', steps=40, name='BODY_lantern')
    solidify(lantern, 0.010, offset=-1)
    win = [box(0.075, 0.40, 0.085, (0.155, 0, H), 'pump2', rot=(0, 0, 0)),
           box(0.075, 0.085, 0.40, (0.155, 0, H), 'pump2')]
    boolean(lantern, win)
    # mechanical seal gland inside the lantern (seen through the windows)
    gland = lathe([(0.0, 0.088), (0.075, 0.088), (0.075, 0.105), (0.050, 0.110), (0.045, 0.150), (0.0, 0.150)],
                  loc=(0, 0, H), axis='X', mat='steel', steps=24, name='gland')
    glandbolts = bolt_ring(4, 0.062, 'X', (0.112, 0, H), size=0.008, h=0.02, phase=PI / 4, name='glandbolts')
    gland = join([gland, glandbolts], 'gland')

    # --- bearing frame: ribbed housing, oil sight glass, breather, support foot --------------
    frame = lathe([(0.0, 0.205), (0.098, 0.205), (0.098, 0.222), (0.086, 0.228), (0.084, 0.500),
                   (0.094, 0.505), (0.094, 0.522), (0.070, 0.528), (0.070, 0.548), (0.0, 0.548)],
                  loc=(0, 0, H), axis='X', mat='pump', steps=40, name='frame')
    ribs = []
    for a in (PI / 4, 3 * PI / 4, 5 * PI / 4, 7 * PI / 4):
        r = box(0.27, 0.014, 0.026, (0.365, 0.086 * math.cos(a), H + 0.086 * math.sin(a)), 'pump',
                rot=(a, 0, 0))
        ribs.append(r)
    # bearing-frame support foot
    leg = box(0.05, 0.13, H - BASE_TOP - 0.07, (0.44, 0, BASE_TOP + (H - BASE_TOP - 0.07) / 2 + 0.01), 'pump',
              bevel=0.006)
    pad = box(0.11, 0.17, 0.016, (0.44, 0, BASE_TOP + 0.008), 'pump', bevel=0.004)
    # oil filler / breather on top, drain at bottom
    breather = join([cyl(0.020, 0.030, (0.30, 0, H + 0.098), 'Z', 'pump', verts=16),
                     cyl(0.024, 0.016, (0.30, 0, H + 0.120), 'Z', 'steel', verts=6)], 'breather')
    bframe = join([frame, *ribs, leg, pad, breather], 'BODY_bearing_frame')
    bevel(bframe, 0.003, 1, 50)
    # oil sight glass on the operator side (-Y): brass bezel + amber lens
    sg_ring = lathe([(0.0, 0.0), (0.024, 0.0), (0.024, 0.012), (0.016, 0.014), (0.0, 0.014)],
                    loc=(0.36, -0.086, H - 0.035), axis='Y', mat='brass', steps=24, name='sg')
    sg_ring.rotation_euler = (PI, 0, 0)
    lib.apply_xf(sg_ring)
    sg_lens = cyl(0.015, 0.004, (0.36, -0.100, H - 0.035), 'Y', 'sight', verts=24, name='sightglass')
    # constant-level oiler on the other side
    oiler = join([cyl(0.008, 0.04, (0.27, 0.10, H - 0.03), 'Y', 'steel', verts=10),
                  cyl(0.026, 0.07, (0.27, 0.12, H + 0.02), 'Z', 'sight', verts=20),
                  cyl(0.028, 0.012, (0.27, 0.12, H + 0.06), 'Z', 'steel', verts=20)], 'oiler')

    # status band around the bearing frame end
    band = lathe([(0.0870, 0.470), (0.0905, 0.470), (0.0905, 0.488), (0.0870, 0.488)], loc=(0, 0, H),
                 axis='X', mat='status', steps=40, name='STATUS_BAND')

    # nameplate on the bearing bracket
    plate = box(0.004, 0.08, 0.05, (0.0, 0, 0), 'plate', bevel=0.001)
    plate.rotation_euler = (0, 0, PI / 2)
    plate.location = (0.33, -0.088, H + 0.035)
    lib.apply_xf(plate, location=False)

    # --- rotating assembly: shaft + flexible coupling half --------------------------------
    shaft = cyl(0.022, 0.56, (0.36, 0, H), 'X', 'stainless', verts=24, name='shaft')
    key = box(0.05, 0.008, 0.006, (0.63, 0, H + 0.023), 'steel')
    hub = lathe([(0.022, 0.585), (0.050, 0.585), (0.054, 0.590), (0.054, 0.640), (0.072, 0.642),
                 (0.074, 0.648), (0.074, 0.664), (0.022, 0.664)], loc=(0, 0, H), axis='X',
                mat='castiron', steps=32, name='hub')
    jaws = [box(0.022, 0.03, 0.03, (0.675, 0.052 * math.cos(a), H + 0.052 * math.sin(a)), 'rubber',
                rot=(a, 0, 0)) for a in [i * PI / 3 for i in range(6)]]
    jaw = join(jaws, 'jaw')
    set_mat(jaw, 'rubber')
    rot = join([shaft, key, hub, jaw], 'ROTOR_shaft')
    rotor(rot, (0, 0, H), 'X', speed=18.0)

    # --- baseplate: fabricated channel frame with drip-rim deck, pads, anchor bolts ---------
    bx0, bx1, by = -0.36, 0.70, 0.25
    base = box(bx1 - bx0, 2 * by, BASE_TOP, ((bx0 + bx1) / 2, 0, BASE_TOP / 2), 'frame')
    # inset the top and sink it to form the drip rim
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(base.data)
    top = [f for f in bm.faces if f.normal.z > 0.9]
    bmesh.ops.inset_region(bm, faces=top, thickness=0.022, depth=0)
    bmesh.ops.translate(bm, vec=(0, 0, -0.012), verts=list({v for f in top for v in f.verts}))
    # chamfer the bottom flange line: inset sides slightly via a loop of the lower verts
    bm.to_mesh(base.data)
    bm.free()
    bevel(base, 0.004, 1, 50)
    anchors = []
    for x in (bx0 + 0.06, bx1 - 0.06):
        for y in (-by + 0.06, by - 0.06):
            anchors.append(cyl(0.022, 0.016, (x, y, BASE_TOP - 0.004), 'Z', 'steel', verts=6))
            anchors.append(cyl(0.010, 0.04, (x, y, BASE_TOP + 0.01), 'Z', 'steel', verts=8))
    grout = box(bx1 - bx0 + 0.08, 2 * by + 0.08, 0.025, ((bx0 + bx1) / 2, 0, 0.0125), 'concrete2', bevel=0.006)
    base = join([base, grout], 'BODY_baseplate')
    hw = join(studs + anchors + [gland], 'hardware')
    set_mat(hw, 'steel')

    port('in', (-0.322, 0, H), (-1, 0, 0))
    port('out', (0.0, -0.198, dz + 0.024), (0, 0, 1))
    return finalize('pump_end_suction')


if __name__ == '__main__':
    lib.main_guard(build)
