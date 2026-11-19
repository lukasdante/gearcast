"""
Circular secondary clarifier, Ø6 m centre-feed, with a rotating half bridge.

Parts: reinforced-concrete basin wall with chamfered coping and footing, peripheral launder with a
V-notch weir plate and scum baffle, centre pier with drive platform + gear drive, fixed feedwell,
rotating half bridge (twin girders, grating walkway, handrails with toe boards, end carriage with
wheel on the wall coping, skimmer blade), inlet pipe through the wall (-X), launder outlet box with
outlet pipe (+X), and an access stair to the wall top.

Blender space: Z up. Rotating parts are one ROTOR (axis Z -> three.js 'y').
Run:  blender -b --factory-startup --python app/models-src/clarifier.py
"""
import os
import sys
import math
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import (cyl, box, lathe, loft, join, bevel, solidify, array, curve_tube, port, finalize, reset,
                 set_mat, rotor, mesh_from, PI)  # noqa: E402

RI, RO, HTOP = 3.0, 3.25, 2.0      # basin inner/outer radius, wall top
WL = 1.86                          # normal water level (just below the weir crest)


def handrail(x0, y0, x1, y1, z, posts=4, name='rail', z1=None, toe=True):
    """Handrail (top + knee rail, posts, optional toe board) from base (x0,y0,z) to (x1,y1,z1)."""
    return lib.handrail((x0, y0, z), (x1, y1, z if z1 is None else z1), posts=posts, name=name, toe=toe)


def weir_plate(r, z0, crest, notch, n):
    """Thin V-notch weir band: bottom ring at z0, top edge zig-zags between crest and crest-notch."""
    rings = []
    bot, top = [], []
    for i in range(2 * n):
        a = 2 * PI * i / (2 * n)
        bot.append((r * math.cos(a), r * math.sin(a), z0))
        top.append((r * math.cos(a), r * math.sin(a), crest - (notch if i % 2 else 0.0)))
    o = loft([bot, top], 'weir', 'stainless', cap_start=False, cap_end=False)
    solidify(o, 0.006, offset=0)
    return o


def build():
    reset()

    # --- concrete basin -------------------------------------------------------------------
    wall = lathe([(RI, 0.0), (RO + 0.12, 0.0), (RO + 0.12, 0.12), (RO, 0.14), (RO, HTOP - 0.03),
                  (RO - 0.03, HTOP), (RI + 0.03, HTOP), (RI, HTOP - 0.03), (RI, 0.0)],
                 mat='concrete', steps=96, name='wall')
    floor = cyl(RI + 0.01, 0.05, (0, 0, 0.3), 'Z', 'concrete', verts=48, name='floor')
    pier = lathe([(0.0, 0.0), (0.38, 0.0), (0.38, 2.25), (0.36, 2.28), (0.0, 2.28)], mat='concrete2', steps=32,
                 name='pier')
    basin = join([wall, floor, pier], 'BODY_basin')

    # launder (peripheral trough) + weir + scum baffle
    launder = lathe([(RI - 0.42, 1.50), (RI, 1.50), (RI, 1.56), (RI - 0.36, 1.56), (RI - 0.36, 1.80),
                     (RI - 0.42, 1.80)], mat='concrete2', steps=96, name='launder')
    weir = weir_plate(RI - 0.43, 1.74, 1.90, 0.07, 160)
    baffle = lathe([(RI - 0.70, 1.62), (RI - 0.69, 1.62), (RI - 0.69, 1.98), (RI - 0.70, 1.98)], mat='galv',
                   steps=96, name='baffle')
    brackets = [box(0.30, 0.02, 0.04, ((RI - 0.55) * math.cos(a), (RI - 0.55) * math.sin(a), 1.95), 'galv',
                    rot=(0, 0, a)) for a in [i * 2 * PI / 24 for i in range(24)]]
    launder = join([launder, weir, baffle] + brackets, 'BODY_launder')

    # fixed feedwell on struts from the pier top
    fw = lathe([(0.80, 0.95), (0.81, 0.95), (0.81, 2.08), (0.80, 2.08)], mat='galv', steps=48, name='fw')
    fw_lip = lathe([(0.78, 2.04), (0.86, 2.04), (0.86, 2.08), (0.78, 2.08)], mat='galv', steps=48, name='fwl')
    struts = [box(0.5, 0.06, 0.06, (0.58 * math.cos(a), 0.58 * math.sin(a), 2.12), 'galv', rot=(0, 0, a))
              for a in [i * PI / 2 + PI / 4 for i in range(4)]]
    feedwell = join([fw, fw_lip] + struts, 'BODY_feedwell')

    # --- water: disc inside the launder, origin at the surface ------------------------------
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=RI - 0.44, fill_type='TRIFAN', location=(0, 0, 0))
    w = bpy.context.object
    w.name = 'WATER_surface'
    set_mat(w, 'water')
    w.location = (0, 0, WL)
    lib.EXTRA_META['water'] = {'min': 1.60, 'max': 1.88}

    # --- rotating half bridge ------------------------------------------------------------------
    rb = []
    r0, r1 = 0.20, RO + 0.05
    L = r1 - r0
    yc = -(r0 + r1) / 2       # bridge runs from the pier toward -Y (faces the default camera)
    zb = 2.36
    for sx in (-0.42, 0.42):
        web = box(0.012, L, 0.30, (sx, yc, zb), 'process')
        fl_t = box(0.12, L, 0.014, (sx, yc, zb + 0.15), 'process')
        fl_b = box(0.12, L, 0.014, (sx, yc, zb - 0.15), 'process')
        rb += [web, fl_t, fl_b]
    for y in [-(r0 + L * t) for t in (0.05, 0.35, 0.65, 0.95)]:
        rb.append(box(0.84, 0.08, 0.10, (0, y, zb - 0.08), 'process'))
    # grating walkway: bearing bars across + side flats
    g = box(0.86, 0.006, 0.03, (0, -r0 - 0.02, zb + 0.172), 'grating')
    array(g, int(L / 0.035), (0, -0.035, 0))
    rb.append(g)
    rb.append(box(0.012, L, 0.04, (-0.43, yc, zb + 0.177), 'grating'))
    rb.append(box(0.012, L, 0.04, (0.43, yc, zb + 0.177), 'grating'))
    rails = [handrail(sx, -r0 - 0.1, sx, -r1 + 0.05, zb + 0.157, posts=4, name='hr') for sx in (-0.44, 0.44)]
    # end carriage on the wall coping with a wheel
    carriage = box(1.0, 0.36, 0.30, (0, -(RI + RO) / 2, HTOP + 0.24), 'process', bevel=0.02)
    wheel = cyl(0.11, 0.08, (0.25, -(RI + RO) / 2, HTOP + 0.11), 'X', 'rubber', verts=20)
    gearm = box(0.30, 0.22, 0.22, (-0.30, -(RI + RO) / 2 + 0.05, HTOP + 0.50), 'motor', bevel=0.02)
    gearm2 = cyl(0.09, 0.28, (-0.30, -(RI + RO) / 2 + 0.05, HTOP + 0.50), 'X', 'motor', verts=16)
    # skimmer blade + hangers and a submerged scraper arm stub under the surface
    sk = box(0.02, RI - 1.2, 0.25, (0.6, -(0.95 + RI - 0.45) / 2, WL + 0.04), 'process')
    hangers = [box(0.04, 0.04, zb - WL - 0.1, (0.55, -y, (zb + WL) / 2 + 0.02), 'galv') for y in (1.2, 2.4)]
    # centre cage + slewing ring housing on the pier
    cage = lathe([(0.0, 2.28), (0.55, 2.28), (0.55, 2.36), (0.42, 2.40), (0.42, 2.58), (0.30, 2.62), (0.0, 2.62)],
                 mat='motor', steps=32, name='cage')
    status = lathe([(0.421, 2.47), (0.428, 2.47), (0.428, 2.51), (0.421, 2.51)], mat='status', steps=32,
                   name='sb')
    rot = join(rb + rails + [carriage, wheel, gearm, gearm2, sk] + hangers + [cage], 'ROTOR_bridge')
    rotor(rot, (0, 0, 0), 'Z', speed=0.06)
    status.name = 'STATUS_BAND'
    # status lamp on a short mast on the pier platform (fixed)
    mast = cyl(0.025, 0.55, (0.0, 0.0, 2.9), 'Z', 'galv', verts=10, name='mast')
    lamp = lib.sphere(0.06, (0.0, 0.0, 3.2), 'status', seg=16, rings=8, name='STATUS_LAMP')

    # --- inlet pipe (-X), launder outlet box + outlet pipe (+X) --------------------------------
    pin = cyl(0.11, 0.45, (-RO - 0.15, 0, 1.0), 'X', 'galv', verts=24)
    pin_fl = lathe([(0.08, 0.0), (0.17, 0.0), (0.17, 0.026), (0.08, 0.026)], loc=(-RO - 0.40, 0, 1.0), axis='X',
                   mat='galv', steps=32, name='pf')
    obox = box(0.55, 0.8, 1.30, (RO + 0.22, 0, 0.65 + 0.0), 'concrete2', bevel=0.02)
    pout = cyl(0.11, 0.45, (RO + 0.65, 0, 0.45), 'X', 'galv', verts=24)
    pout_fl = lathe([(0.08, 0.0), (0.17, 0.0), (0.17, 0.026), (0.08, 0.026)], loc=(RO + 0.874, 0, 0.45), axis='X',
                    mat='galv', steps=32, name='pof')
    pipes = join([pin, pin_fl, pout, pout_fl], 'pipes')
    obox.name = 'BODY_outlet_box'

    # --- access stair to the wall top (tangential, on +Y side) --------------------------------
    st = []
    n = 11
    rise = HTOP / n
    run = 0.26
    x0 = 0.0
    yst = RO + 0.45
    for i in range(n):
        st.append(box(run + 0.03, 0.8, 0.03, (x0 - 0.6 - (n - 1 - i) * run, yst, rise * (i + 1)), 'grating'))
    Ls = math.hypot(n * run, HTOP)
    ang = math.atan2(HTOP, n * run)
    for sy in (-0.42, 0.42):
        s = box(Ls + 0.2, 0.012, 0.2, (x0 - 0.6 - (n - 1) * run / 2, yst + sy, HTOP / 2 + 0.05), 'process',
                rot=(0, -ang, 0))
        st.append(s)
    landing = box(1.0, 1.1, 0.04, (0.0, RO + 0.30, HTOP + 0.0), 'grating')
    lsup = [box(0.08, 0.08, HTOP, (sx, RO + 0.75, HTOP / 2), 'process') for sx in (-0.45, 0.45)]
    st += [landing] + lsup
    stair = join(st, 'BODY_stair')
    xa, xb = x0 - 0.6 - (n - 1) * run - run / 2, x0 - 0.6 + run / 2
    srails = [handrail(xa, yst + sy, xb, yst + sy, rise, posts=3, name='sr', z1=HTOP + 0.0, toe=False)
              for sy in (-0.44, 0.44)]
    lr = handrail(0.5, RO + 0.85, -0.5, RO + 0.85, HTOP, posts=3, name='lr')
    join(srails + [lr], 'stair_rails')

    port('in', (-RO - 0.40, 0, 1.0), (-1, 0, 0))
    port('out', (RO + 0.90, 0, 0.45), (1, 0, 0))
    return finalize('clarifier', smooth_angle=35)


if __name__ == '__main__':
    lib.main_guard(build)
