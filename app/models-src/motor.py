"""
IEC foot-mounted TEFC induction motor, frame 132M (7.5 kW 4-pole IE3, 440 V, 1750 rpm), on a
fabricated channel riser that brings the shaft to the same 0.36 m axis as pump_end_suction.

Reference: app/public/figures/FIG-03 (finned frame, DE/NDE shields, fan + cowl, terminal box).
IEC 132M: shaft height 132, foot centres A=216 / B=178, shaft D38 x E80.

Blender space: Z up, shaft along X; drive end (DE) on -X faces the pump, fan cowl on +X.
Run:  blender -b --factory-startup --python app/models-src/motor.py
"""
import os
import sys
import math
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import (cyl, box, lathe, loft, torus, sphere, boolean, join, solidify, bevel, rotor,
                 finalize, reset, set_mat, PI)  # noqa: E402

H = 0.36            # shaft axis height
SH = 0.132          # IEC shaft height (axis above foot underside)
FOOT = H - SH       # top of riser


def finned_section(r_core, r_tip, n_fins, fin_t, skip=()):
    """2D outline (y, z) of a finned motor frame: arcs on the core circle with rectangular fins."""
    pts = []
    step = 2 * PI / n_fins
    for i in range(n_fins):
        a = i * step
        # arc between fins
        for k in range(3):
            aa = a + step * (0.15 + 0.35 * k)
            pts.append((r_core * math.cos(aa), r_core * math.sin(aa)))
        af = a + step
        if any(abs(((af - s + PI) % (2 * PI)) - PI) < w for s, w in skip):
            pts.append((r_core * math.cos(af), r_core * math.sin(af)))
            continue
        h = math.asin(fin_t / 2 / r_core)
        ht = math.asin(fin_t / 2 / r_tip)
        for ang, rr in ((af - h, r_core), (af - ht * 0.8, r_tip), (af + ht * 0.8, r_tip), (af + h, r_core)):
            pts.append((rr * math.cos(ang), rr * math.sin(ang)))
    return pts


def extrude_yz(pts, x0, x1, name, mat, z0=0.0):
    rings = [[(x, y, z + z0) for y, z in pts] for x in (x0, x1)]
    return loft(rings, name, mat)


def build():
    reset()

    # --- stator frame: extruded finned section --------------------------------------------
    sec = finned_section(0.100, 0.128, 40, 0.007, skip=((3 * PI / 2, 0.55), (PI / 2, 0.30)))
    frame = extrude_yz(sec, -0.160, 0.140, 'frame', 'motor', z0=H)
    # foot webs + feet with bolt holes (IEC 132M: A=216, B=178)
    feet = []
    for x in (-0.089, 0.089):
        for sy in (-1, 1):
            feet.append(box(0.058, 0.052, 0.024, (x, sy * 0.108, FOOT + 0.012), 'motor', bevel=0.004))
            feet.append(box(0.044, 0.07, 0.085, (x, sy * 0.075, FOOT + 0.06), 'motor', bevel=0.004))
    feet.append(box(0.30, 0.13, 0.03, (0.0, 0.0, H - 0.098), 'motor'))
    feetj = join(feet, 'feet')
    holes = [cyl(0.0075, 0.08, (x, sy * 0.115, FOOT + 0.012), 'Z', verts=12) for x in (-0.089, 0.089) for sy in (-1, 1)]
    boolean(feetj, holes)
    # lifting-lug pad + terminal box seat cast on the top of the frame
    seat = box(0.17, 0.16, 0.03, (-0.02, 0, H + 0.105), 'motor', bevel=0.005)
    lug = box(0.05, 0.04, 0.03, (0.085, 0, H + 0.11), 'motor', bevel=0.006)
    body = join([frame, feetj, seat, lug], 'BODY_frame')
    bevel(body, 0.002, 1, 60)

    # --- end shields -------------------------------------------------------------------------
    de = lathe([(0.0, -0.212), (0.040, -0.212), (0.044, -0.206), (0.060, -0.200), (0.090, -0.188),
                (0.108, -0.172), (0.114, -0.166), (0.114, -0.155), (0.0, -0.155)],
               loc=(0, 0, H), axis='X', mat='motor2', steps=40, name='de')
    de_bolts = lib.bolt_ring(4, 0.104, 'X', (-0.170, 0, H), size=0.008, h=0.02, phase=PI / 4, name='debolts')
    nde = lathe([(0.0, 0.135), (0.114, 0.135), (0.114, 0.146), (0.100, 0.152), (0.060, 0.158), (0.0, 0.158)],
                loc=(0, 0, H), axis='X', mat='motor2', steps=40, name='nde')
    shields = join([de, nde], 'BODY_endshields')

    # --- fan cowl: pressed-steel shell with a slotted grille end ------------------------------
    cowl = lathe([(0.118, 0.142), (0.131, 0.150), (0.133, 0.160), (0.133, 0.298), (0.128, 0.312),
                  (0.112, 0.320), (0.0, 0.320)], loc=(0, 0, H), axis='X', mat='motor2', steps=48, name='cowl')
    solidify(cowl, 0.003, offset=-1)
    slots = []
    for i in range(24):
        a = 2 * PI * i / 24
        for r0, r1 in ((0.030, 0.062), (0.070, 0.106)):
            rc = (r0 + r1) / 2
            s = box(0.04, r1 - r0, 0.009, (0.318, rc * math.cos(a), H + rc * math.sin(a)), 'motor2',
                    rot=(a, 0, 0))  # local Y -> radial
            slots.append(s)
    boolean(cowl, slots)
    cowl.name = 'BODY_cowl'
    cowl_screws = lib.bolt_ring(3, 0.134, 'X', (0.17, 0, H), size=0.006, h=0.012, phase=PI / 2, name='cs')

    # --- terminal box, cable gland, eyebolt, nameplate ---------------------------------------
    tb = box(0.15, 0.15, 0.085, (-0.02, 0, H + 0.162), 'motor', bevel=0.008, seg=2)
    lid = box(0.162, 0.162, 0.016, (-0.02, 0, H + 0.212), 'motor2', bevel=0.006, seg=2)
    tbj = join([tb, lid], 'BODY_terminal_box')
    gland = join([cyl(0.017, 0.03, (-0.02, -0.088, H + 0.155), 'Y', 'steel', verts=16),
                  cyl(0.021, 0.012, (-0.02, -0.098, H + 0.155), 'Y', 'steel', verts=6),
                  cyl(0.012, 0.03, (-0.02, -0.115, H + 0.155), 'Y', 'rubber', verts=12)], 'gland')
    screws = [cyl(0.006, 0.006, (-0.02 + dx, dy, H + 0.222), 'Z', 'steel', verts=8)
              for dx in (-0.065, 0.065) for dy in (-0.065, 0.065)]
    eye = join([cyl(0.009, 0.03, (0.085, 0, H + 0.135), 'Z', 'steel', verts=12),
                torus(0.024, 0.0065, (0.085, 0, H + 0.172), rot=(PI / 2, 0, 0), mat='steel', major=24, minor=8)],
               'eyebolt')
    plate = box(0.004, 0.10, 0.06, (0, 0, 0), 'plate', bevel=0.001)
    plate.rotation_euler = (0, 0, PI / 2)
    plate.location = (-0.01, -0.129, H + 0.02)
    lib.apply_xf(plate)
    plate.name = 'nameplate'
    plate_rivets = [cyl(0.003, 0.003, (-0.01 + dx, -0.1325, H + 0.02 + dz), 'Y', 'steel', verts=6)
                    for dx in (-0.044, 0.044) for dz in (-0.024, 0.024)]

    # status pilot lamp on the terminal-box lid
    lamp_base = cyl(0.016, 0.012, (0.035, -0.045, H + 0.226), 'Z', 'rubber', verts=16, name='lampbase')
    lamp = sphere(0.014, (0.035, -0.045, H + 0.232), 'status', seg=16, rings=8, scale=(1, 1, 0.8),
                  name='STATUS_LAMP')

    # --- rotating assembly: shaft, key, coupling half, fan --------------------------------
    shaft = cyl(0.019, 0.56, (0.0, 0, H), 'X', 'stainless', verts=24)
    key = box(0.06, 0.010, 0.006, (-0.24, 0, H + 0.019), 'steel')
    hub = lathe([(0.019, -0.300), (0.074, -0.300), (0.074, -0.284), (0.070, -0.278), (0.052, -0.276),
                 (0.050, -0.230), (0.019, -0.230)], loc=(0, 0, H), axis='X', mat='castiron', steps=32, name='hub')
    jaws = [box(0.022, 0.03, 0.03, (-0.300, 0.052 * math.cos(a), H + 0.052 * math.sin(a)), 'castiron',
                rot=(a, 0, 0)) for a in [PI / 6 + i * PI / 3 for i in range(6)]]
    fanhub = cyl(0.03, 0.04, (0.20, 0, H), 'X', 'frame', verts=20)
    blades = [box(0.035, 0.085, 0.006, (0.205, 0.068 * math.cos(a), H + 0.068 * math.sin(a)), 'frame',
                  rot=(a, 0.0, 0)) for a in [i * 2 * PI / 9 for i in range(9)]]
    for b in blades:
        b.rotation_euler.rotate_axis('Y', 0.5)
    fan = join([fanhub] + blades, 'fan')
    set_mat(fan, 'frame')
    rot = join([shaft, key, hub, *jaws, fan], 'ROTOR_shaft')
    rotor(rot, (0, 0, H), 'X', speed=18.0)

    # --- open fabricated stand: shallow C-channel rails, SHS legs, braces, foot plates ------
    CH = 0.08                                   # rail channel depth
    ch = [(0.0, 0.0), (0.045, 0.0), (0.045, 0.007), (0.006, 0.007), (0.006, CH - 0.007),
          (0.045, CH - 0.007), (0.045, CH), (0.0, CH)]
    parts = []
    for sy in (-1, 1):
        pts = [(sy * (0.095 + y), z) for y, z in ch]   # web inboard, flanges outboard
        if sy < 0:
            pts = list(reversed(pts))
        parts.append(extrude_yz(pts, -0.21, 0.21, 'ch', 'frame', z0=FOOT - CH))
    LX, LY = 0.175, 0.118
    for x in (-LX, LX):
        parts.append(box(0.04, 2 * LY + 0.04, 0.05, (x, 0, FOOT - CH + 0.025), 'frame', bevel=0.003))  # end tie
        for sy in (-1, 1):
            leg = box(0.045, 0.045, FOOT - CH - 0.012, (x, sy * LY, 0.012 + (FOOT - CH - 0.012) / 2), 'frame',
                      bevel=0.004)
            parts.append(leg)
            parts.append(box(0.10, 0.09, 0.012, (x, sy * LY, 0.006), 'frame', bevel=0.003))
    # flat-bar diagonal braces on both long sides
    import math as _m
    dz = FOOT - CH - 0.04
    ln = _m.hypot(2 * LX - 0.05, dz)
    ang = _m.atan2(dz, 2 * LX - 0.05)
    for sy in (-1, 1):
        parts.append(box(ln, 0.008, 0.035, (0, sy * (LY + 0.0), 0.03 + dz / 2), 'frame', rot=(0, -ang, 0)))
    riser = join(parts, 'BODY_riser')
    set_mat(riser, 'frame')
    bolts = []
    for x in (-0.089, 0.089):
        for sy in (-1, 1):
            bolts.append(cyl(0.012, 0.012, (x, sy * 0.115, FOOT + 0.03), 'Z', 'steel', verts=6))
            bolts.append(cyl(0.007, 0.03, (x, sy * 0.115, FOOT + 0.02), 'Z', 'steel', verts=8))
    for x in (-LX - 0.03, -LX + 0.03, LX - 0.03, LX + 0.03):
        for sy in (-1, 1):
            bolts.append(cyl(0.010, 0.010, (x, sy * LY, 0.017), 'Z', 'steel', verts=6))
    hw = join(bolts + screws + plate_rivets + [de_bolts, cowl_screws, gland, eye], 'hardware')

    return finalize('motor')


if __name__ == '__main__':
    lib.main_guard(build)
