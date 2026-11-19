"""Shared vibrator-motor builder (FIG-05): finned body, foot plate, end covers over the eccentric weights.

Used by vibrator_motor.py (stand-alone pair) and vibrating_screen.py (motors on the drive beam).
"""
import math
from lib import cyl, box, lathe, join, bevel, set_mat, PI


def vibrator_motor(cx, cy, cz, name='vm', length=0.40, r=0.088, paint='motor', steps=36):
    """Axis along Y, foot underside at cz. Returns (body, hardware) objects."""
    ax_z = cz + r + 0.035              # axis height above foot underside
    half = length / 2
    # body: lathe along Y with a raised centre ring and shallow end shoulders
    body = lathe([(0.0, -half + 0.075), (r - 0.006, -half + 0.075), (r, -half + 0.085), (r, half - 0.085),
                  (r - 0.006, half - 0.075), (0.0, half - 0.075)], loc=(cx, cy, ax_z), axis='Y',
                 mat=paint, steps=steps, name=name + '_body')
    body.rotation_euler = (0, 0, 0)
    # cooling fins: rings around the body
    fins = []
    n = 7
    for i in range(n):
        y = -half + 0.11 + i * (length - 0.22) / (n - 1)
        fins.append(lathe([(r - 0.004, y - 0.005), (r + 0.016, y - 0.003), (r + 0.016, y + 0.003),
                           (r - 0.004, y + 0.005)], loc=(cx, cy, ax_z), axis='Y', mat=paint, steps=steps, name='fin'))
    # foot: cast saddle + bolting flange with 4 bosses
    saddle = box(0.15, length - 0.16, ax_z - cz - 0.03, (cx, cy, cz + 0.022 + (ax_z - cz - 0.03) / 2), paint, bevel=0.01)
    footp = box(0.26, length - 0.14, 0.024, (cx, cy, cz + 0.012), paint, bevel=0.006)
    # end covers (eccentric weight housings): domed caps both ends
    covers = []
    for s in (-1, 1):
        prof = [(0.0, 0.0), (r + 0.010, 0.0), (r + 0.012, 0.010), (r + 0.006, 0.055), (r - 0.025, 0.075), (0.0, 0.08)]
        c = lathe(prof, loc=(0, 0, 0), axis='Z', mat='motor2', steps=steps, name='cov')
        c.rotation_euler = (-s * PI / 2, 0, 0)
        c.location = (cx, cy + s * (half - 0.08), ax_z)
        from lib import apply_xf
        apply_xf(c, location=True)
        covers.append(c)
    # terminal box on top
    tb = box(0.11, 0.10, 0.06, (cx, cy, ax_z + r + 0.02), paint, bevel=0.008)
    tbl = box(0.12, 0.11, 0.012, (cx, cy, ax_z + r + 0.054), paint, bevel=0.004)
    gland = cyl(0.012, 0.03, (cx + 0.065, cy, ax_z + r + 0.02), 'X', 'rubber', verts=10, name='gl')
    o = join([body, *fins, saddle, footp, *covers, tb, tbl], name)
    bevel(o, 0.002, 1, 55)

    hw = []
    for dx in (-0.105, 0.105):
        for dy in (-(length / 2 - 0.1), (length / 2 - 0.1)):
            hw.append(cyl(0.014, 0.016, (cx + dx, cy + dy, cz + 0.032), 'Z', 'steel', verts=6))
    for s in (-1, 1):
        hw.append(cyl(0.010, 0.006, (cx, cy + s * (half + 0.0), ax_z), 'Y', 'steel', verts=6))
        for k in range(6):
            a = k * PI / 3
            hw.append(cyl(0.006, 0.01, (cx + (r + 0.004) * math.cos(a), cy + s * (half - 0.072),
                                        ax_z + (r + 0.004) * math.sin(a)), 'Y', 'steel', verts=6))
    hw.append(gland)
    h = join(hw, name + '_hw')
    return o, h, ax_z
