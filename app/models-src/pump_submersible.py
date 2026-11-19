"""
Submersible non-clog sewage pump (Tsurumi 100B42.2 class: DN100, 2.2 kW, 50 m3/h @ 10 m) seated on a
guide-rail duck-foot discharge connection with twin guide rails and a lifting chain.

Reference: app/public/figures/FIG-02 (handle 1, dry motor 2, oil chamber 5, volute/impeller 7,
strainer stand 8, discharge 9, guide rail 10, power cable 11) and FIG-13 (guide-rail lifting).

Blender space: Z up. Strainer (inlet) faces -X, duck-foot riser flange (outlet) on +X pointing up.
Run:  blender -b --factory-startup --python app/models-src/pump_submersible.py
"""
import os
import sys
import math
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import (cyl, box, lathe, loft, torus, boolean, join, bevel, rotor, port, curve_tube,
                 finalize, reset, set_mat, PI)  # noqa: E402

PX = -0.13          # pump vertical axis x
Z_CASE = 0.13       # bottom of the volute casing (top of strainer stand)


def superellipse(n, a, b, e=0.6):
    out = []
    for k in range(n):
        t = 2 * PI * k / n
        c, s = math.cos(t), math.sin(t)
        out.append((a * math.copysign(abs(c) ** e, c), b * math.copysign(abs(s) ** e, s)))
    return out


def volute():
    """Horizontal spiral scroll around the vertical pump axis, exiting tangentially toward +X."""
    N, steps = 18, 34
    rings = []
    zc = Z_CASE + 0.065
    phi0 = 0.5
    R0, R1, s0, s1, h0, h1 = 0.118, 0.140, 0.026, 0.050, 0.040, 0.058
    for i in range(steps + 1):
        t = i / steps
        phi = phi0 + (2 * PI - phi0) * t
        rc, s, h = R0 + (R1 - R0) * t, s0 + (s1 - s0) * t, h0 + (h1 - h0) * t
        # point on the spiral; at phi = 2pi it sits at -Y moving toward +X
        ux, uy = math.sin(phi), -math.cos(phi)
        cx, cy = PX + rc * ux, rc * uy
        rings.append([(cx + ux * rd, cy + uy * rd, zc + ax) for rd, ax in superellipse(N, s, h)])
    # discharge throat straight out along +X into the DN100 flange
    cy = -R1
    rn = 0.058
    for x, k in ((0.03, 0.4), (0.07, 0.85), (0.10, 1.0)):
        a, b = s1 + (rn - s1) * k, h1 + (rn - h1) * k
        rings.append([(PX + x, cy - rd, zc + ax) for rd, ax in superellipse(N, a, b, 0.6 + 0.4 * k)])
    return loft(rings, 'vol', 'castiron')


def build():
    reset()

    # --- strainer stand: bottom ring, vertical bars, top ring; impeller eye visible inside ----
    ring_lo = lathe([(0.10, 0.0), (0.155, 0.0), (0.155, 0.022), (0.10, 0.022)], loc=(PX, 0, 0), mat='castiron',
                    steps=40, name='rl')
    ring_hi = lathe([(0.0, Z_CASE - 0.018), (0.150, Z_CASE - 0.018), (0.150, Z_CASE), (0.0, Z_CASE)],
                    loc=(PX, 0, 0), mat='castiron', steps=40, name='rh')
    bars = [box(0.012, 0.022, Z_CASE - 0.03, (PX + 0.145 * math.cos(a), 0.145 * math.sin(a), 0.011 + (Z_CASE - 0.03) / 2),
                'castiron', rot=(0, 0, a)) for a in [i * 2 * PI / 22 for i in range(22)]]
    stand = join([ring_lo, ring_hi] + bars, 'BODY_strainer')
    bevel(stand, 0.002, 1, 50)
    floor = cyl(0.10, 0.004, (PX, 0, 0.004), 'Z', 'dark', verts=32, name='floor')

    # impeller (seen through the strainer) — spins when running
    hub = lathe([(0.0, Z_CASE - 0.02), (0.035, Z_CASE - 0.02), (0.02, Z_CASE - 0.075), (0.0, Z_CASE - 0.08)],
                loc=(PX, 0, 0), mat='stainless', steps=20, name='hub')
    vanes = []
    for i in range(3):
        a = i * 2 * PI / 3
        v = box(0.10, 0.012, 0.05, (PX + 0.05 * math.cos(a), 0.05 * math.sin(a), Z_CASE - 0.045), 'stainless',
                rot=(0, 0, a + 0.5))
        vanes.append(v)
    imp = join([hub] + vanes, 'ROTOR_impeller')
    set_mat(imp, 'stainless')
    rotor(imp, (PX, 0, Z_CASE), 'Z', speed=14.0)

    # --- volute casing + discharge flange with guide claw -------------------------------------
    vol = volute()
    case = lathe([(0.0, Z_CASE), (0.128, Z_CASE), (0.132, Z_CASE + 0.01), (0.122, Z_CASE + 0.12),
                  (0.0, Z_CASE + 0.12)], loc=(PX, 0, 0), mat='castiron', steps=40, name='case')
    fx = PX + 0.10
    zc = Z_CASE + 0.065
    flange = lathe([(0.0, 0.0), (0.105, 0.0), (0.105, 0.022), (0.0, 0.022)], loc=(fx, -0.140, zc), axis='X',
                   mat='castiron', steps=32, name='fl')
    claw = box(0.03, 0.10, 0.20, (fx + 0.012, -0.08, zc + 0.03), 'castiron', bevel=0.006)
    casing = join([vol, case, flange, claw], 'BODY_casing')
    bevel(casing, 0.003, 1, 50)

    # --- oil chamber + motor frame + head cover --------------------------------------------
    zm = Z_CASE + 0.12
    motor = lathe([(0.0, zm), (0.118, zm), (0.122, zm + 0.008), (0.122, zm + 0.075), (0.130, zm + 0.08),
                   (0.130, zm + 0.098), (0.124, zm + 0.104), (0.124, zm + 0.40), (0.132, zm + 0.405),
                   (0.132, zm + 0.425), (0.115, zm + 0.43), (0.105, zm + 0.47), (0.070, zm + 0.495),
                   (0.0, zm + 0.50)], loc=(PX, 0, 0), mat='pump', steps=48, name='motor')
    # shallow vertical cooling ribs on the frame
    ribs = [box(0.012, 0.010, 0.28, (PX + 0.126 * math.cos(a), 0.126 * math.sin(a), zm + 0.25), 'pump', rot=(0, 0, a))
            for a in [i * 2 * PI / 16 + PI / 16 for i in range(16)]]
    body = join([motor] + ribs, 'BODY_motor')
    bevel(body, 0.002, 1, 50)
    bolts = [lib.bolt_ring(10, 0.126, 'Z', (PX, 0, zm + 0.09), size=0.008, h=0.03, name='b1'),
             lib.bolt_ring(10, 0.128, 'Z', (PX, 0, zm + 0.415), size=0.008, h=0.03, name='b2'),
             lib.bolt_ring(8, 0.140, 'Z', (PX, 0, Z_CASE + 0.005), size=0.009, h=0.03, name='b3')]
    band = lathe([(0.1245, zm + 0.36), (0.1275, zm + 0.36), (0.1275, zm + 0.375), (0.1245, zm + 0.375)],
                 loc=(PX, 0, 0), mat='status', steps=48, name='STATUS_BAND')
    plate = box(0.004, 0.07, 0.045, (0, 0, 0), 'plate', bevel=0.001)
    plate.rotation_euler = (0, 0, -PI / 2 + 0.0)
    plate.location = (PX, -0.127, zm + 0.22)
    lib.apply_xf(plate)
    plate.name = 'nameplate'

    # lifting handle (bent bar) + cable gland and power cable
    ztop = zm + 0.50
    handle = curve_tube([(PX - 0.09, 0, ztop - 0.03), (PX - 0.08, 0, ztop + 0.10), (PX, 0, ztop + 0.14),
                         (PX + 0.08, 0, ztop + 0.10), (PX + 0.09, 0, ztop - 0.03)], 0.011, mat='stainless',
                        name='handle', res=6)
    gland = join([cyl(0.022, 0.04, (PX + 0.05, 0.05, ztop - 0.005), 'Z', 'steel', verts=6),
                  cyl(0.016, 0.03, (PX + 0.05, 0.05, ztop + 0.03), 'Z', 'rubber', verts=12)], 'gland')
    cable = curve_tube([(PX + 0.05, 0.05, ztop + 0.04), (PX + 0.07, 0.07, ztop + 0.16), (PX + 0.20, 0.10, ztop + 0.22),
                        (fx + 0.02, 0.06, 1.0), (fx + 0.042, 0.035, 1.32)], 0.0115, mat='rubber', name='cable', res=10)

    # --- duck-foot discharge connection + guide rails -----------------------------------------
    dx0 = fx + 0.024                    # mating face of the duck-foot
    base = box(0.36, 0.34, 0.02, (0.20, -0.04, 0.01), 'frame', bevel=0.004)
    pedestal = box(0.14, 0.16, zc - 0.07, (0.25, -0.14, 0.02 + (zc - 0.07) / 2), 'frame', bevel=0.006)
    dflange = lathe([(0.0, 0.0), (0.108, 0.0), (0.108, 0.024), (0.0, 0.024)], loc=(dx0, -0.140, zc), axis='X',
                    mat='frame', steps=32, name='df')
    # elbow: swept circle along a quarter arc from +X horizontal to vertical
    Rb = 0.13
    rings = []
    for i in range(13):
        a = (PI / 2) * i / 12
        cxp, czp = dx0 + 0.02 + Rb * math.sin(a), zc + Rb * (1 - math.cos(a))
        tx, tz = math.cos(a), math.sin(a)      # tangent
        nx, nz = -math.sin(a), math.cos(a)     # normal in XZ
        rings.append([(cxp + nx * 0.058 * math.cos(t), -0.140 + 0.058 * math.sin(t), czp + nz * 0.058 * math.cos(t))
                      for t in [k * 2 * PI / 20 for k in range(20)]])
    elbow = loft(rings, 'elbow', 'frame')
    ex = dx0 + 0.02 + Rb
    riser_top = 0.52
    riser = cyl(0.058, riser_top - (zc + Rb), (ex, -0.140, (zc + Rb + riser_top) / 2), 'Z', 'frame', verts=20)
    top_fl = lathe([(0.045, 0.0), (0.110, 0.0), (0.110, 0.024), (0.045, 0.024)], loc=(ex, -0.140, riser_top),
                   axis='Z', mat='frame', steps=32, name='tf')
    holes = [cyl(0.0095, 0.08, (ex + 0.09 * math.cos(a), -0.14 + 0.09 * math.sin(a), riser_top), 'Z', verts=10)
             for a in [PI / 8 + i * PI / 4 for i in range(8)]]
    boolean(top_fl, holes)
    bore = cyl(0.045, 0.004, (ex, -0.140, riser_top + 0.012), 'Z', 'dark', verts=20, name='bore')
    # guide rails (2" pipe) from the duck-foot bracket upward
    rails = []
    for ry in (-0.05, 0.05):
        rails.append(cyl(0.024, 1.15, (fx + 0.042, -0.08 + ry, 0.20 + 0.575), 'Z', 'stainless', verts=16))
    rail_bracket = box(0.06, 0.16, 0.03, (fx + 0.042, -0.08, 0.20), 'frame', bevel=0.004)
    rail_top = box(0.06, 0.16, 0.025, (fx + 0.042, -0.08, 1.36), 'frame', bevel=0.004)
    duck = join([base, pedestal, dflange, elbow, riser, top_fl, rail_bracket, rail_top], 'BODY_duckfoot')
    set_mat(duck, 'frame')
    rail = join(rails, 'rails')
    anchors = [cyl(0.014, 0.012, (0.20 + dx, -0.04 + dy, 0.026), 'Z', 'steel', verts=6)
               for dx in (-0.15, 0.15) for dy in (-0.14, 0.14)]

    # lifting chain: alternating links from the handle up to the top bracket hook
    links = []
    z = ztop + 0.14
    n = 0
    while z < 1.30:
        links.append(torus(0.020, 0.0045, (PX, 0, z + 0.02), rot=(PI / 2, 0, (n % 2) * PI / 2), mat='galv',
                           major=12, minor=6))
        z += 0.034
        n += 1
    chain = join(links, 'chain')
    set_mat(chain, 'galv')
    hook = box(0.36 - 0.0, 0.03, 0.02, ((PX + fx + 0.042) / 2, -0.04, 1.33), 'frame', bevel=0.003)
    hook.name = 'hookbar'
    hw = join(bolts + anchors + [gland], 'hardware')

    port('in', (PX - 0.155, 0, 0.07), (-1, 0, 0))
    port('out', (ex, -0.140, riser_top + 0.024), (0, 0, 1))
    return finalize('pump_submersible')


if __name__ == '__main__':
    lib.main_guard(build)
