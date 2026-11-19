"""
Production building (portal-frame shed, 8.0 x 5.0 m, 4.6 m eaves, 6.0 m ridge) - the wastewater source.

Parts: concrete plinth wall, trapezoidal-rib wall cladding (ribbed profile extruded; gables follow
the roof pitch), ribbed roof sheets with overhang, ridge cap, gutters and downpipes, roll-up door
with hood box and guide channels, personnel door with canopy, window band, gable louvre, two roof
exhaust fans (ROTOR), effluent drain pipe leaving on +X, beacon lamp over the door.

Blender space: Z up. Single outlet port ('out' = process wastewater drain).
Run:  blender -b --factory-startup --python app/models-src/building.py
"""
import os
import sys
import math
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import cyl, box, lathe, loft, join, bevel, set_mat, port, finalize, reset, rod, pipe_path, rotor, PI  # noqa: E402
import parts  # noqa: E402

L, W, EAVE, RIDGE, PL = 8.0, 5.0, 4.6, 6.0, 0.9
hl, hw = L / 2, W / 2
PITCH = (RIDGE - EAVE) / hw


def rib_profile(length, pitch=0.25, depth=0.035):
    """(u, d) points of a trapezoidal rib sheet along u in [-length/2, length/2]; d = outward depth."""
    pts = []
    n = int(length / pitch)
    p = length / n
    for i in range(n):
        u0 = -length / 2 + i * p
        pts += [(u0, 0.0), (u0 + p * 0.55, 0.0), (u0 + p * 0.65, depth), (u0 + p * 0.9, depth)]
    pts.append((length / 2, 0.0))
    return pts


def wall(axis, sign, length, top_fn, name):
    """Ribbed wall strip. axis 'Y' -> wall in the XZ plane at y = sign*hw; axis 'X' -> YZ plane at x = sign*hl."""
    prof = rib_profile(length)
    rings = []
    for zf in ('bot', 'top'):
        ring = []
        for u, d in prof:
            z = PL if zf == 'bot' else top_fn(u)
            if axis == 'Y':
                ring.append((u, sign * (hw + d), z))
            else:
                ring.append((sign * (hl + d), u, z))
        rings.append(ring)
    return loft(rings, name, 'cladding', cap_start=False, cap_end=False)


def build():
    reset()
    plinth = box(L + 0.1, W + 0.1, PL, (0, 0, PL / 2), 'concrete')
    slab = box(L + 1.2, W + 1.2, 0.08, (0, 0, 0.04), 'concrete2', bevel=0.01)
    walls = [wall('Y', s, L, lambda u: EAVE, 'w') for s in (-1, 1)]
    walls += [wall('X', s, W, lambda u: EAVE + PITCH * (hw - abs(u)), 'g') for s in (-1, 1)]
    # inner liner so the open-strip walls read solid from any side
    liner = box(L - 0.02, W - 0.02, EAVE - PL, (0, 0, (EAVE + PL) / 2), 'cladding')
    gable_in = loft([[(-hl + 0.01, -hw, EAVE), (-hl + 0.01, hw, EAVE), (-hl + 0.01, 0, RIDGE - 0.02)],
                     [(hl - 0.01, -hw, EAVE), (hl - 0.01, hw, EAVE), (hl - 0.01, 0, RIDGE - 0.02)]], 'gin', 'cladding')
    corners = [box(0.10, 0.10, EAVE - PL, (sx * (hl + 0.03), sy * (hw + 0.03), (EAVE + PL) / 2), 'roof')
               for sx in (-1, 1) for sy in (-1, 1)]
    shell = join([plinth, slab] + walls + [liner, gable_in] + corners, 'BODY_shell')

    # roof: two ribbed slopes (ribs run down the slope), overhang 0.3 m
    roofs = []
    ov = 0.3
    span = math.hypot(hw + ov, (hw + ov) * PITCH)
    for s in (-1, 1):
        prof = rib_profile(L + 2 * ov, pitch=0.3, depth=0.04)
        rings = []
        for t in (0.0, 1.0):
            y = s * (hw + ov) * (1 - t)
            z = RIDGE + 0.04 - PITCH * abs(y)
            nz = 1 / math.sqrt(1 + PITCH ** 2)
            ny = s * PITCH * nz
            rings.append([(u, y + ny * d, z + nz * d) for u, d in prof])
        r = loft(rings, 'roof', 'roof', cap_start=False, cap_end=False)
        lib.solidify(r, 0.02, offset=-1)
        roofs.append(r)
    ridge = loft([[(-hl - ov, -0.25, RIDGE + 0.04 - 0.25 * PITCH + 0.02), (-hl - ov, 0, RIDGE + 0.1),
                   (-hl - ov, 0.25, RIDGE + 0.04 - 0.25 * PITCH + 0.02)],
                  [(hl + ov, -0.25, RIDGE + 0.04 - 0.25 * PITCH + 0.02), (hl + ov, 0, RIDGE + 0.1),
                   (hl + ov, 0.25, RIDGE + 0.04 - 0.25 * PITCH + 0.02)]], 'ridge', 'galv')
    gut = []
    for s in (-1, 1):
        y = s * (hw + ov + 0.06)
        z = RIDGE + 0.04 - PITCH * (hw + ov) - 0.04
        gp = [(0, -0.07), (0.01, -0.07), (0.01, 0.06), (0.11, 0.06), (0.11, -0.07), (0.12, -0.07), (0.12, 0.07),
              (0.0, 0.07)]
        gut.append(loft([[(x, y - s * 0.06 + s * a, z + b) for a, b in gp] for x in (-hl - ov, hl + ov)], 'gut',
                        'galv', cap_start=True, cap_end=True))
        for x in (-hl + 0.2, hl - 0.2):
            gut.append(pipe_path([(x, y, z - 0.05), (x, y, z - 0.25), (x, s * (hw + 0.1), z - 0.6),
                                  (x, s * (hw + 0.1), 0.25), (x, s * (hw + 0.3), 0.12)], 0.045, bend=0.15,
                                 mat='galv', name='dp', sides=10))
    roof = join(roofs + [ridge], 'BODY_roof')
    gutters = join(gut, 'gutters')

    # roll-up door on the -Y wall
    dx, dw, dh = -1.4, 3.0, 3.4
    yf = -hw - 0.05
    door = box(dw, 0.04, dh, (dx, yf - 0.02, PL * 0 + dh / 2 + 0.08), 'galv')
    slats = box(dw - 0.04, 0.012, 0.012, (dx, yf - 0.045, 0.2), 'steel')
    lib.array(slats, int(dh / 0.11), (0, 0, 0.11))
    hood = box(dw + 0.3, 0.45, 0.45, (dx, yf - 0.22, dh + 0.33), 'roof', bevel=0.02)
    guides = [box(0.10, 0.12, dh + 0.1, (dx + s * (dw / 2 + 0.05), yf - 0.06, dh / 2 + 0.1), 'roof') for s in (-1, 1)]
    hz = box(dw, 0.02, 0.20, (dx, yf - 0.05, 0.18), 'safety')
    rollup = join([door, slats, hood, hz] + guides, 'BODY_rollup')
    # cut the plinth/wall opening visually: dark reveal frame
    reveal = box(dw + 0.1, 0.02, 0.06, (dx, yf - 0.01, dh + 0.11), 'dark')
    # personnel door + canopy
    px = 2.0
    pdoor = box(1.0, 0.05, 2.1, (px, yf - 0.03, PL + 1.05 - 0.9 + 0.9 * 0 + 0.0), 'upright')
    pdoor.location.z = 1.13
    pframe = box(1.12, 0.03, 2.2, (px, yf - 0.005, 1.15), 'roof')
    canopy = box(1.6, 0.9, 0.06, (px, yf - 0.45, 2.55), 'roof', bevel=0.01)
    steps_ = box(1.4, 0.6, 0.16, (px, yf - 0.32, 0.16), 'concrete2', bevel=0.01)
    pd = join([pframe, pdoor, canopy, steps_], 'BODY_pdoor')
    handle = box(0.12, 0.03, 0.03, (px + 0.35, yf - 0.07, 1.1), 'steel')
    # window band on -Y wall (right of the roll-up door) and +Y wall
    wins = []
    for s, xs in ((-1, (0.6, 3.1)), (1, (-3.0, -1.0, 1.0, 3.0))):
        for x in xs:
            wins.append(box(1.3, 0.05, 0.75, (x, s * (hw + 0.05), 3.5), 'window'))
            wins.append(box(1.4, 0.07, 0.06, (x, s * (hw + 0.06), 3.1), 'roof'))
            wins.append(box(0.04, 0.06, 0.75, (x, s * (hw + 0.06), 3.5), 'roof'))
    win = join(wins, 'windows')
    # gable louvre on -X
    louv = [box(0.06, 0.9, 0.04, (-hl - 0.06, 0.0, 4.3 + i * 0.09), 'roof', rot=(0.0, -0.5, 0)) for i in range(6)]
    louv.append(box(0.04, 1.0, 0.65, (-hl - 0.04, 0, 4.52), 'dark'))
    louvre = join(louv, 'louvre')

    # roof exhaust fans: fixed cowl + spinning impeller cap
    fans = []
    FY = -1.2   # on the front (-Y) roof slope
    for x in (-2.0, 2.0):
        zr = RIDGE - PITCH * abs(FY)
        base = cyl(0.36, 0.25, (x, FY, zr + 0.1), 'Z', 'galv', verts=24)
        cowl = lathe([(0.0, 0.0), (0.42, 0.0), (0.42, 0.04), (0.30, 0.08), (0.0, 0.10)], loc=(x, FY, zr + 0.48),
                     mat='galv', steps=24, name='cowl')
        posts = [rod((x + 0.3 * math.cos(a), FY + 0.3 * math.sin(a), zr + 0.22),
                     (x + 0.3 * math.cos(a), FY + 0.3 * math.sin(a), zr + 0.48), 0.012, 'galv', verts=6)
                 for a in (0.3, 2.4, 4.5)]
        fans.append(join([base, cowl] + posts, 'fan_body'))
        blades = [box(0.26, 0.05, 0.008, (x + 0.14 * math.cos(a), FY + 0.14 * math.sin(a), zr + 0.30), 'steel',
                      rot=(0.4, 0, a)) for a in [i * PI / 3 for i in range(6)]]
        hub = cyl(0.05, 0.06, (x, FY, zr + 0.30), 'Z', 'steel', verts=12)
        imp = join(blades + [hub], 'ROTOR_fan')
        rotor(imp, (x, FY, 0), 'Z', speed=8.0)
    fanb = join(fans, 'BODY_fans')

    # effluent drain leaving the +X gable
    eff = join([pipe_path([(hl - 0.3, 1.2, 0.6), (hl + 0.05, 1.2, 0.6), (hl + 0.8, 1.2, 0.6)], 0.08, mat='galv',
                          name='eff'),
                parts.flange_pair((hl + 0.8, 1.2, 0.6), (1, 0, 0), 0.08),
                box(0.12, 0.3, 0.6 - 0.08, (hl + 0.55, 1.2, 0.26), 'frame')], 'drain')
    sign = box(1.6, 0.03, 0.4, (-1.4, -hw - 0.30, 4.35), 'marker', bevel=0.01)
    sign.name = 'sign'
    beacon = lib.sphere(0.07, (px, yf - 0.85, 2.68), 'status', seg=14, rings=7, name='STATUS_LAMP')

    port('out', (hl + 0.8, 1.2, 0.6), (1, 0, 0))
    return finalize('building', smooth_angle=30)


if __name__ == '__main__':
    lib.main_guard(build)
