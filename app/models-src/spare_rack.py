"""
Spares store: two-bay adjustable pallet racking (3.8 m x 1.1 m x 2.2 m) holding the plant's critical
spares: crated spare end-suction pump, a spare IEC motor on a pallet, a submersible pump on a pallet,
a vibrator motor, oil drum and cartons (bearings, seals, screen mesh rolls).

Parts: lacing-braced upright frames with base plates, step beams, wire-mesh decks, timber pallets
with deck boards, crate with battens, simplified spares, end-of-aisle sign with status lamp.
Blender space: Z up. No process ports.
Run:  blender -b --factory-startup --python app/models-src/spare_rack.py
"""
import os
import sys
import math
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import cyl, box, lathe, join, bevel, set_mat, finalize, reset, rod, array, PI  # noqa: E402

BAY, D, HT = 1.85, 1.1, 2.2
LEVELS = (0.12, 1.05, 1.95)


def pallet(cx, cy, z, name='pallet'):
    p = []
    for i in range(7):
        p.append(box(1.2, 0.10, 0.022, (cx, cy - 0.45 + i * 0.15, z + 0.133), 'wood'))
    for y in (-0.45, 0.0, 0.45):
        p.append(box(1.2, 0.10, 0.022, (cx, cy + y, z + 0.011), 'wood'))
        for x in (-0.55, 0.0, 0.55):
            p.append(box(0.10, 0.10, 0.10, (cx + x, cy + y, z + 0.072), 'wood'))
    o = join(p, name)
    set_mat(o, 'wood')
    return o


def build():
    reset()
    xs = (-BAY, 0.0, BAY)
    frames = []
    for x in xs:
        for y in (-D / 2, D / 2):
            frames.append(box(0.09, 0.07, HT, (x, y, HT / 2), 'upright', bevel=0.004))
            frames.append(box(0.16, 0.14, 0.008, (x, y, 0.004), 'upright'))
        # lacing: horizontals + diagonals in the frame plane
        zs = [0.15 + i * 0.5 for i in range(5)]
        for z0, z1 in zip(zs[:-1], zs[1:]):
            frames.append(rod((x, -D / 2 + 0.03, z0), (x, D / 2 - 0.03, z1), 0.012, 'upright', verts=6))
        for z in zs:
            frames.append(rod((x, -D / 2 + 0.03, z), (x, D / 2 - 0.03, z), 0.012, 'upright', verts=6))
    uprights = join(frames, 'BODY_frames')
    beams, decks = [], []
    for i in range(2):
        cx = xs[i] + BAY / 2
        for z in LEVELS[1:]:
            for y in (-D / 2, D / 2):
                beams.append(box(BAY - 0.09, 0.05, 0.11, (cx, y, z), 'rack', bevel=0.005))
            w = box(0.004, D - 0.04, 0.025, (cx - BAY / 2 + 0.08, 0, z + 0.062), 'galv')
            array(w, 34, ((BAY - 0.16) / 33, 0, 0))
            c = box(BAY - 0.14, 0.004, 0.004, (cx, -D / 2 + 0.05, z + 0.072), 'galv')
            array(c, 12, (0, (D - 0.1) / 11, 0))
            decks += [w, c]
    beam_o = join(beams, 'BODY_beams')
    deck_o = join(decks, 'decks')

    items = []
    # bay 1 / level 0: crated spare end-suction pump on a pallet
    cx0 = xs[0] + BAY / 2
    items.append(pallet(cx0, 0, 0.0))
    crate = []
    cz = 0.145
    cw, cd, ch = 1.15, 0.85, 0.62
    for (sx, sy, sz, lx, ly, lz) in (
            (cw, 0.02, ch, 0, -cd / 2, ch / 2), (cw, 0.02, ch, 0, cd / 2, ch / 2),
            (0.02, cd, ch, -cw / 2, 0, ch / 2), (0.02, cd, ch, cw / 2, 0, ch / 2), (cw, cd, 0.02, 0, 0, ch)):
        crate.append(box(sx, sy, sz, (cx0 + lx, ly, cz + lz), 'carton'))
    for lx in (-cw / 2 + 0.05, 0.0, cw / 2 - 0.05):
        for ly in (-cd / 2 - 0.012, cd / 2 + 0.012):
            crate.append(box(0.08, 0.02, ch, (cx0 + lx, ly, cz + ch / 2), 'wood'))
    for ly in (-cd / 2 - 0.012, cd / 2 + 0.012):
        crate.append(box(cw, 0.022, 0.08, (cx0, ly, cz + ch - 0.04), 'wood'))
    stencil = box(0.30, 0.004, 0.12, (cx0 - 0.2, -cd / 2 - 0.024, cz + 0.35), 'marker')
    crate_o = join(crate + [stencil], 'crate')
    # bay 2 / level 0: spare motor on pallet (simplified finned motor)
    cx1 = xs[1] + BAY / 2
    items.append(pallet(cx1, 0, 0.0))
    m = []
    zc = 0.145 + 0.135
    m.append(cyl(0.11, 0.30, (cx1, 0, zc), 'X', 'motor', verts=24))
    for i in range(16):
        a = i * 2 * PI / 16
        m.append(box(0.30, 0.008, 0.03, (cx1, 0.115 * math.cos(a), zc + 0.115 * math.sin(a)), 'motor', rot=(a, 0, 0)))
    m.append(cyl(0.13, 0.14, (cx1 + 0.22, 0, zc), 'X', 'motor2', verts=24))
    m.append(cyl(0.02, 0.10, (cx1 - 0.20, 0, zc), 'X', 'stainless', verts=10))
    m.append(box(0.14, 0.14, 0.09, (cx1, 0, zc + 0.15), 'motor', bevel=0.01))
    m.append(box(0.24, 0.24, 0.03, (cx1, 0, 0.16), 'motor'))
    motor = join(m, 'spare_motor')
    # bay 1 / level 1: submersible pump on pallet + vibrator motor
    items.append(pallet(cx0, 0, LEVELS[1] + 0.075))
    zb = LEVELS[1] + 0.075 + 0.145
    sub = [lathe([(0.0, 0.0), (0.15, 0.0), (0.15, 0.12), (0.13, 0.13), (0.13, 0.25), (0.12, 0.26), (0.12, 0.62),
                  (0.08, 0.66), (0.0, 0.67)], loc=(cx0 - 0.15, 0, zb), mat='pump', steps=24, name='sub')]
    sub.append(lib.curve_tube([(cx0 - 0.24, 0, zb + 0.62), (cx0 - 0.15, 0, zb + 0.75), (cx0 - 0.06, 0, zb + 0.62)],
                              0.01, mat='stainless', res=4, bevel_res=0))
    sub.append(lib.torus(0.11, 0.012, (cx0 + 0.3, 0.15, zb + 0.02), mat='rubber', major=20, minor=6))
    sub.append(lib.torus(0.11, 0.012, (cx0 + 0.3, 0.15, zb + 0.045), mat='rubber', major=20, minor=6))
    subo = join(sub, 'spare_sub')
    vm = [cyl(0.085, 0.36, (cx0 + 0.32, -0.2, zb + 0.13), 'Y', 'motor', verts=20),
          box(0.24, 0.26, 0.03, (cx0 + 0.32, -0.2, zb + 0.015), 'motor')]
    vmo = join(vm, 'spare_vm')
    # bay 2 / level 1: cartons
    cart = []
    for i, (dx, dy, sx, sy, sz) in enumerate([(-0.55, -0.25, 0.45, 0.4, 0.35), (-0.05, -0.25, 0.45, 0.4, 0.3),
                                               (0.45, -0.2, 0.5, 0.5, 0.4), (-0.4, 0.25, 0.6, 0.4, 0.28),
                                               (0.2, 0.28, 0.5, 0.38, 0.45), (-0.3, -0.25, 0.4, 0.35, 0.25)]):
        z = LEVELS[1] + 0.075 + (0.35 if i == 5 else 0)
        cart.append(box(sx, sy, sz, (cx1 + dx, dy, z + sz / 2), 'carton', bevel=0.008))
        cart.append(box(sx * 0.98, 0.06, 0.004, (cx1 + dx, dy, z + sz + 0.002), 'marker'))
    carto = join(cart, 'cartons')
    # top level: screen mesh rolls and seal kits
    rolls = [cyl(0.09, 1.1, (cx0 + dx, 0, LEVELS[2] + 0.075 + 0.09), 'Y', 'mesh', verts=16) for dx in (-0.4, -0.2, 0.0)]
    rolls += [box(0.3, 0.25, 0.18, (cx0 + 0.5, dy, LEVELS[2] + 0.075 + 0.09), 'carton', bevel=0.01) for dy in (-0.2, 0.2)]
    rollo = join(rolls, 'rolls')
    drum = lathe([(0.0, 0.0), (0.29, 0.0), (0.28, 0.02), (0.28, 0.27), (0.295, 0.28), (0.28, 0.29), (0.28, 0.58),
                  (0.29, 0.6), (0.0, 0.6)], loc=(cx1 + 0.35, 0, LEVELS[2] + 0.075), mat='ochre', steps=24, name='drum')
    drum2 = lathe([(0.0, 0.0), (0.29, 0.0), (0.28, 0.02), (0.28, 0.27), (0.295, 0.28), (0.28, 0.29), (0.28, 0.58),
                   (0.29, 0.6), (0.0, 0.6)], loc=(cx1 - 0.35, 0, LEVELS[2] + 0.075), mat='pump', steps=24, name='drum2')
    pallets = join(items, 'pallets')

    # end-of-aisle sign + lamp
    sign_post = cyl(0.03, 2.4, (xs[0] - 0.25, -D / 2 - 0.1, 1.2), 'Z', 'galv', verts=8)
    sign = box(0.02, 0.6, 0.3, (xs[0] - 0.25, -D / 2 - 0.1, 2.15), 'marker', bevel=0.005)
    sign_o = join([sign_post, sign], 'BODY_sign')
    lamp = lib.sphere(0.05, (xs[0] - 0.25, -D / 2 - 0.1, 2.45), 'status', seg=14, rings=7, name='STATUS_LAMP')
    # floor marking: hazard line along the aisle
    mark = box(2 * BAY + 0.4, 0.08, 0.004, (0, -D / 2 - 0.35, 0.002), 'safety')
    mark.name = 'floor_mark'
    return finalize('spare_rack', smooth_angle=35)


if __name__ == '__main__':
    lib.main_guard(build)
