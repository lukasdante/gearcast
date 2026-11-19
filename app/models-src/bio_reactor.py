"""
Biological reactor: rectangular activated-sludge aeration basin (7.0 x 5.0 m, 3.0 m walls) with
an anoxic/aerobic baffle wall, wall-top walkway with handrails, air main with diffuser drop legs and
butterfly valves, a duty/standby blower skid with acoustic hoods, DO-probe brackets, inlet pipe (-X)
and an outlet weir box with outlet pipe (+X), plus an access stair.

Blender space: Z up. WATER_surface carries the mixed liquor (brown) colour.
Run:  blender -b --factory-startup --python app/models-src/bio_reactor.py
"""
import os
import sys
import math
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import cyl, box, join, bevel, set_mat, port, finalize, reset, rod, pipe_path, PI  # noqa: E402
import parts  # noqa: E402

LX, LY, T, H = 7.0, 5.0, 0.30, 3.0
hx, hy = LX / 2, LY / 2


def build():
    reset()
    outer = box(LX, LY, H, (0, 0, H / 2), 'concrete')
    inner = box(LX - 2 * T, LY - 2 * T, H, (0, 0, H / 2 + 0.3), 'concrete')
    lib.boolean(outer, inner)
    bevel(outer, 0.02, 1, 50)
    baffle = box(0.20, LY - 2 * T, H - 0.5, (-1.2, 0, (H - 0.5) / 2 + 0.3), 'concrete2')
    # wall-top walkway: widened coping cantilevered inward along the -Y wall
    coping = box(LX, 1.0, 0.15, (0, -hy + 0.5, H - 0.075), 'concrete2', bevel=0.01)
    plinths = [box(1.8, 1.6, 0.15, (x, -hy - 1.2, 0.075), 'concrete2', bevel=0.01) for x in (2.2,)]
    basin = join([outer, baffle, coping] + plinths, 'BODY_basin')
    set_mat(basin, 'concrete')
    rails = join([lib.handrail((-hx + 0.05, -hy + 0.95, H), (hx - 0.05, -hy + 0.95, H), posts=6, name='a'),
                  lib.handrail((-hx + 0.05, -hy + 0.05, H), (hx - 0.05, -hy + 0.05, H), posts=6, name='b',
                               toe=False)], 'BODY_rails')

    # air main along the walkway + 6 drop legs with butterfly valves
    am = []
    z_air = H + 0.35
    am.append(pipe_path([(2.2, -hy - 1.0, 0.95), (2.2, -hy - 0.6, 0.95), (2.2, -hy - 0.6, z_air),
                         (2.2, -hy + 0.8, z_air), (hx - 0.6, -hy + 0.8, z_air)], 0.07, bend=0.25, mat='stainless',
                        name='a1'))
    am.append(pipe_path([(2.2, -hy + 0.8, z_air), (-hx + 0.6, -hy + 0.8, z_air)], 0.07, mat='stainless', name='a2'))
    for x in (-2.6, -1.6, -0.2, 0.9, 2.0, 3.0):
        am.append(pipe_path([(x, -hy + 0.8, z_air), (x, -hy + 1.2, z_air), (x, -hy + 1.2, 0.4),
                             (x, 0.4, 0.4)], 0.04, bend=0.15, mat='stainless', name='drop'))
        am.append(parts.flange_pair((x, -hy + 1.08, z_air), (0, 1, 0), 0.04, mat='stainless'))
        am.append(cyl(0.015, 0.16, (x, -hy + 1.08, z_air + 0.12), 'Z', 'safety', verts=8))
        am.append(box(0.18, 0.03, 0.02, (x, -hy + 1.08, z_air + 0.2), 'safety'))
        am.append(box(0.06, 0.06, z_air - H, (x, -hy + 0.8, H + (z_air - H) / 2 - 0.05), 'frame'))
    air = join(am, 'air_main')

    # blower skid (2 hooded blowers) on the plinth outside the -Y wall
    bl = []
    for x in (1.7, 2.7):
        hood = box(0.75, 1.0, 0.95, (x, -hy - 1.25, 0.15 + 0.475), 'process', bevel=0.03)
        louvres = [box(0.02, 0.6, 0.02, (x - 0.38, -hy - 1.25, 0.35 + i * 0.07), 'frame') for i in range(7)]
        silencer = cyl(0.12, 0.6, (x, -hy - 1.25 + 0.25, 1.4), 'Z', 'galv', verts=16)
        bl += [hood, silencer] + louvres
    bl.append(pipe_path([(1.7, -hy - 1.0, 0.95), (2.7, -hy - 1.0, 0.95)], 0.07, mat='stainless', name='bm'))
    blowers = join(bl, 'BODY_blowers')
    lamp = lib.sphere(0.05, (2.2, -hy - 1.9, 1.25), 'status', seg=14, rings=7, name='STATUS_LAMP')
    lamp_post = cyl(0.025, 1.2, (2.2, -hy - 1.9, 0.6), 'Z', 'galv', verts=8, name='lamp_post')

    # DO probe brackets
    probes = []
    for x in (-2.4, 1.6):
        probes.append(box(0.9, 0.06, 0.06, (x, -hy + 1.3, H + 0.05), 'galv'))
        probes.append(rod((x + 0.42, -hy + 1.3, H + 0.05), (x + 0.42, -hy + 1.5, 1.6), 0.02, 'galv', verts=8))
        probes.append(box(0.16, 0.12, 0.2, (x - 0.2, -hy + 0.6, H + 0.9), 'plate', bevel=0.01))
        probes.append(cyl(0.02, 0.9, (x - 0.2, -hy + 0.6, H + 0.4), 'Z', 'galv', verts=8))
    probe = join(probes, 'probes')

    # inlet (-X) and outlet weir box (+X)
    inlet = join([pipe_path([(-hx - 0.5, 0.8, 2.4), (-hx + 0.4, 0.8, 2.4)], 0.11, mat='galv', name='in'),
                  parts.flange_pair((-hx - 0.5, 0.8, 2.4), (1, 0, 0), 0.11)], 'inlet')
    wbox = box(0.7, 1.2, 1.2, (hx + 0.35, 0.8, H - 0.6 - 0.3), 'concrete2', bevel=0.02)
    wbox.name = 'BODY_weirbox'
    outlet = join([pipe_path([(hx + 0.6, 0.8, 1.1), (hx + 1.0, 0.8, 1.1)], 0.11, mat='galv', name='out'),
                   parts.flange_pair((hx + 1.0, 0.8, 1.1), (1, 0, 0), 0.11)], 'outlet')

    # access stair up to the walkway (along -Y wall, outside)
    st = []
    n = 15
    rise, run = H / n, 0.25
    x_top = -hx + 0.8
    for i in range(n):
        st.append(box(run + 0.03, 0.8, 0.03, (x_top + 0.3 + (n - 1 - i) * run, -hy - 0.5, rise * (i + 1)), 'grating'))
    Ls = math.hypot(n * run, H)
    ang = math.atan2(H, n * run)
    for sy in (-0.42, 0.42):
        st.append(box(Ls + 0.2, 0.012, 0.2, (x_top + 0.3 + (n - 1) * run / 2, -hy - 0.5 + sy, H / 2 + 0.05),
                      'process', rot=(0, ang, 0)))
    landing = box(0.9, 1.0, 0.04, (x_top - 0.2, -hy - 0.5, H), 'grating')
    legs = [box(0.08, 0.08, H, (x_top - 0.55, -hy - 0.5 + s, H / 2), 'process') for s in (-0.42, 0.42)]
    stair = join(st + [landing] + legs, 'BODY_stair')
    srails = join([lib.handrail((x_top + 0.3 + (n - 1) * run + run / 2, -hy - 0.5 - 0.44, rise),
                                (x_top + 0.3 - run / 2, -hy - 0.5 - 0.44, H), posts=4, toe=False, name='s1'),
                   lib.handrail((x_top - 0.65, -hy - 0.95, H), (x_top - 0.65, -hy - 0.05, H), posts=2, name='s2')],
                  'stair_rails')

    # mixed liquor surface
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    w = bpy.context.object
    w.scale = (LX - 2 * T - 0.004, LY - 2 * T - 0.004, 1)
    lib.apply_xf(w)
    w.name = 'WATER_liquor'
    set_mat(w, 'liquor')
    w.location = (0, 0, H - 0.4)
    lib.EXTRA_META['water'] = {'min': 0.6, 'max': H - 0.25}

    port('in', (-hx - 0.5, 0.8, 2.4), (-1, 0, 0))
    port('out', (hx + 1.0, 0.8, 1.1), (1, 0, 0))
    return finalize('bio_reactor', smooth_angle=35)


if __name__ == '__main__':
    lib.main_guard(build)
