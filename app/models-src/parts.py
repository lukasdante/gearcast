"""Reusable plant sub-assemblies for the structure kinds: nozzles, ladders, grating walkways."""
import math
from mathutils import Vector
import lib
from lib import cyl, box, lathe, join, array, rod, PI


def nozzle(p, axis, r=0.11, length=0.35, mat='galv', name='nozzle', flange_r=None):
    """Pipe stub + slip-on flange. p = flange face centre, axis = 'X'|'-X'|'Y'|'-Y'|'Z' pointing outward."""
    sgn = -1 if axis.startswith('-') else 1
    ax = axis[-1]
    fr = flange_r or r + 0.07
    d = Vector({'X': (1, 0, 0), 'Y': (0, 1, 0), 'Z': (0, 0, 1)}[ax]) * sgn
    P = Vector(p)
    pipe = cyl(r, length, tuple(P - d * (length / 2 + 0.024)), ax, mat, verts=24)
    fl = lathe([(r - 0.012, 0.0), (fr, 0.0), (fr, 0.024), (r - 0.012, 0.024)], loc=(0, 0, 0), axis='Z', mat=mat,
               steps=24, name='fl')
    q = d.to_track_quat('Z', 'Y')
    fl.rotation_mode = 'QUATERNION'
    fl.rotation_quaternion = q
    fl.location = P - d * 0.024
    lib.apply_xf(fl, location=True)
    fl.rotation_mode = 'XYZ'
    bore = cyl(r - 0.012, 0.004, tuple(P - d * 0.03), ax, 'dark', verts=20)
    return join([pipe, fl, bore], name)


def cage_ladder(x, y, z0, z1, facing, mat='galv', name='ladder'):
    """Vertical rung ladder with safety cage. facing = outward unit (fx, fy) from the wall."""
    fx, fy = facing
    tx, ty = -fy, fx                        # ladder width direction
    parts = []
    for s in (-0.22, 0.22):
        parts.append(cyl(0.025, z1 - z0 + 1.0, (x + tx * s, y + ty * s, (z0 + z1 + 1.0) / 2), 'Z', mat, verts=8))
    n = int((z1 - z0) / 0.3)
    for i in range(1, n + 1):
        z = z0 + i * 0.3
        parts.append(rod((x - tx * 0.22, y - ty * 0.22, z), (x + tx * 0.22, y + ty * 0.22, z), 0.012, mat, verts=6))
    # cage hoops from 2.3 m upward, with vertical straps
    zc0 = z0 + 2.3
    hoops = []
    z = zc0
    while z <= z1 + 1.0:
        hoops.append(z)
        z += 0.9
    cx, cy = x + fx * 0.35, y + fy * 0.35
    for z in hoops:
        pts = []
        for k in range(13):
            a = math.atan2(-fy, -fx) + 0.75 + (2 * PI - 1.5) * k / 12
            pts.append(Vector((cx + 0.36 * math.cos(a), cy + 0.36 * math.sin(a), z)))
        for a_, b_ in zip(pts[:-1], pts[1:]):
            parts.append(rod(a_, b_, 0.01, mat, verts=6))
    for k in range(5):
        a = math.atan2(-fy, -fx) + 0.75 + (2 * PI - 1.5) * (k + 1) / 6
        px, py = cx + 0.36 * math.cos(a), cy + 0.36 * math.sin(a)
        parts.append(rod((px, py, zc0), (px, py, hoops[-1]), 0.01, mat, verts=6))
    # stand-off brackets
    for z in (z0 + 0.5, (z0 + z1) / 2, z1 - 0.2):
        for s in (-0.22, 0.22):
            parts.append(rod((x + tx * s - fx * 0.2, y + ty * s - fy * 0.2, z), (x + tx * s, y + ty * s, z), 0.015, mat,
                             verts=6))
    return join(parts, name)


def grating_walk(x0, y0, x1, y1, z, width=0.9, name='walk', rails=True, posts=None):
    """Straight grating walkway (bearing bars + side flats) with handrails both sides."""
    a, b = Vector((x0, y0, z)), Vector((x1, y1, z))
    d = b - a
    L = d.length
    ang = math.atan2(d.y, d.x)
    bar = box(0.006, width, 0.03, (0, 0, 0), 'grating')
    array(bar, max(2, int(L / 0.04)), (0.04, 0, 0))
    sides = [box(L, 0.01, 0.04, (L / 2 - 0.02, s * width / 2, 0.005), 'grating') for s in (-1, 1)]
    w = join([bar] + sides, name)
    w.location = (-L / 2 + 0.02, 0, 0)
    lib.apply_xf(w, location=True)
    w.rotation_euler = (0, 0, ang)
    w.location = (a + b) / 2
    lib.apply_xf(w, location=True)
    parts = [w]
    if rails:
        n = posts or max(2, int(L / 1.5) + 1)
        nx, ny = -math.sin(ang), math.cos(ang)
        for s in (-1, 1):
            off = Vector((nx, ny, 0)) * s * (width / 2 + 0.01)
            parts.append(lib.handrail(a + off + Vector((0, 0, 0.02)), b + off + Vector((0, 0, 0.02)), posts=n,
                                      name='hr'))
    return join(parts, name)


def _orient(o, p, d):
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector(d).to_track_quat('Z', 'Y')
    o.location = p
    lib.apply_xf(o, location=True)
    o.rotation_mode = 'XYZ'
    return o


def flange_pair(p, d, r, mat='galv'):
    fl = lathe([(r - 0.01, -0.025), (r + 0.075, -0.025), (r + 0.075, 0.025), (r - 0.01, 0.025)], mat=mat, steps=20,
               name='fp')
    return _orient(fl, p, d)


def check_valve(p, d, r=0.06, mat='castiron', name='check'):
    """Swing check valve (FIG-06): flanged body with a bulged disc chamber and bolted top cover."""
    d = Vector(d).normalized()
    body = lathe([(0.0, -0.17), (r + 0.075, -0.17), (r + 0.075, -0.14), (r + 0.01, -0.13), (r + 0.06, -0.06),
                  (r + 0.07, 0.05), (r + 0.01, 0.13), (r + 0.075, 0.14), (r + 0.075, 0.17), (0.0, 0.17)],
                 mat=mat, steps=20, name='cvb')
    _orient(body, p, d)
    up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    cover = cyl(r + 0.03, 0.04, tuple(Vector(p) + up * (r + 0.07)), 'Z', mat, verts=16)
    _orient(cover, Vector(p) + up * (r + 0.07), up)
    boss = cyl(0.05, 0.06, (0, 0, 0), 'Z', mat, verts=12)
    _orient(boss, Vector(p) + up * (r + 0.05), up)
    arrow = box(0.10, 0.012, 0.004, (0, 0, 0), 'marker')
    side = d.cross(up)
    arrow.location = Vector(p) + side * (r + 0.072)
    return join([body, cover, boss, arrow], name)


def gate_valve(p, d, r=0.06, mat='castiron', name='gate'):
    """Flanged gate valve: body, bonnet, rising stem and handwheel."""
    d = Vector(d).normalized()
    body = lathe([(0.0, -0.12), (r + 0.075, -0.12), (r + 0.075, -0.09), (r + 0.03, -0.08), (r + 0.03, 0.08),
                  (r + 0.075, 0.09), (r + 0.075, 0.12), (0.0, 0.12)], mat=mat, steps=20, name='gvb')
    _orient(body, p, d)
    up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    P = Vector(p)
    bonnet = box(0.10, 2 * r + 0.06, 0.26, (0, 0, 0), mat, bevel=0.015)
    bonnet.location = P + up * (r + 0.13)
    yaw = math.atan2(d.y, d.x)
    bonnet.rotation_euler = (0, 0, yaw)
    lib.apply_xf(bonnet, location=True)
    stem = cyl(0.012, 0.22, (0, 0, 0), 'Z', 'stainless', verts=8)
    _orient(stem, P + up * (r + 0.36), up)
    wheel = lib.torus(0.11, 0.012, (0, 0, 0), mat='safety', major=20, minor=6)
    _orient(wheel, P + up * (r + 0.42), up)
    spokes = [rod(P + up * (r + 0.42), P + up * (r + 0.42) + Vector((math.cos(a), math.sin(a), 0)) * 0.11, 0.008,
                  'safety', verts=6) for a in (0, 2 * PI / 3, 4 * PI / 3)]
    return join([body, bonnet, stem, wheel] + spokes, name)
