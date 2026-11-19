"""
Raw-water collection sump (wet well) with duty/standby submersible pump discharge.

The sump is shown as its above-grade concrete chamber (4.0 x 4.0 m, walls 0.25 m, 1.2 m high):
coping, checker-plate access hatches with hinges and lift handles over the pump bays, an open
bar-grating section with a guard rail to see the liquid, guide-rail tops, two DN100 discharge
risers each with a swing check valve (FIG-06) and gate valve into a common header out on +X,
inlet pipe on -X, a pump-lifting davit with chain hoist (FIG-13), and a float-switch / level
control bracket.

Blender space: Z up, inlet -X, outlet +X.
Run:  blender -b --factory-startup --python app/models-src/sump.py
"""
import os
import sys
import math
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import cyl, box, join, bevel, set_mat, port, finalize, reset, rod, pipe_path, array, PI  # noqa: E402
import parts  # noqa: E402

S, T, H = 4.0, 0.25, 1.2
HS = S / 2


def build():
    reset()
    # --- concrete chamber: walls with thickness + coping chamfer --------------------------------
    import bmesh
    outer = box(S, S, H, (0, 0, H / 2), 'concrete')
    inner = box(S - 2 * T, S - 2 * T, H, (0, 0, H / 2 + 0.25), 'concrete')
    lib.boolean(outer, inner)
    bevel(outer, 0.02, 1, 50)
    floor = box(S - 2 * T, S - 2 * T, 0.05, (0, 0, 0.025), 'concrete2')
    # top beam dividing pump bays from the open grating section
    beam = box(S - 2 * T, 0.30, 0.20, (0.35, 0, H - 0.10), 'concrete2', bevel=0.01)
    beam.rotation_euler = (0, 0, PI / 2)
    lib.apply_xf(beam)
    beam.location.x = 0.35
    basin = join([outer, floor, beam], 'BODY_chamber')
    set_mat(basin, 'concrete')

    # --- covers: checker-plate hatches over the pump bays (x > 0.5), open grating elsewhere -----
    covers = []
    for y in (-0.75, 0.75):
        lid = box(1.2, 1.2, 0.012, (1.07, y, H + 0.006), 'plate', bevel=0.004)
        frame = box(1.28, 1.28, 0.02, (1.07, y, H + 0.004), 'frame')
        handle = lib.curve_tube([(0.62, y - 0.12, H + 0.012), (0.58, y - 0.12, H + 0.05), (0.58, y + 0.12, H + 0.05),
                                 (0.62, y + 0.12, H + 0.012)], 0.008, mat='steel', res=2, bevel_res=0)
        hinges = [cyl(0.018, 0.12, (1.71, y + s, H + 0.02), 'Y', 'steel', verts=10) for s in (-0.4, 0.4)]
        covers += [lid, frame, handle] + hinges
    hatch = join(covers, 'hatches')
    # open grating over the inlet half
    g = box(0.006, S - 2 * T, 0.03, (-HS + T + 0.02, 0, H + 0.015), 'grating')
    array(g, int((HS - T + 0.2) / 0.035), (0.035, 0, 0))
    cross = box(HS - T + 0.2, 0.01, 0.03, ((-HS + T + 0.2) / 2, 0, H + 0.015), 'grating')
    array(cross, 15, (0, (S - 2 * T) / 14, 0))
    cross.location.y = -(S - 2 * T) / 2
    grating = join([g, cross], 'grating')
    # guard rail along the open edge and the inlet side
    rail = join([lib.handrail((-HS + 0.12, -HS + 0.12, H), (-HS + 0.12, HS - 0.12, H), posts=4, name='r1'),
                 lib.handrail((-HS + 0.12, HS - 0.12, H), (0.3, HS - 0.12, H), posts=3, name='r2'),
                 lib.handrail((-HS + 0.12, -HS + 0.12, H), (0.3, -HS + 0.12, H), posts=3, name='r3')], 'BODY_rail')

    # --- discharge: risers -> check valve -> gate valve -> header -> outlet ---------------------
    pipes, valves = [], []
    r = 0.058
    for y in (-0.75, 0.75):
        p0 = Vector((1.25, y, H - 0.1))
        bend = Vector((1.25, y, H + 0.45))
        pipes.append(pipe_path([p0, bend, (1.55, y, H + 0.45)], r, bend=0.18, mat='galv', name='rs'))
        valves.append(parts.check_valve((1.75, y, H + 0.45), (1, 0, 0), r=r))
        valves.append(parts.gate_valve((2.12, y, H + 0.45), (1, 0, 0), r=r))
        pipes.append(pipe_path([(1.92, y, H + 0.45), (2.0, y, H + 0.45)], r, mat='galv', name='sp'))
        pipes.append(pipe_path([(2.24, y, H + 0.45), (2.45, y, H + 0.45), (2.45, 0.0, H + 0.45)], r, bend=0.15,
                               mat='galv', name='to_hdr'))
        for xx in (1.58, 1.92, 2.0, 2.24):
            valves.append(parts.flange_pair((xx, y, H + 0.45), (1, 0, 0), r))
    pipes.append(pipe_path([(2.40, 0, H + 0.45), (2.75, 0, H + 0.45)], 0.075,
                           mat='galv', name='hdr'))
    hdr_fl = parts.flange_pair((2.75, 0, H + 0.45), (1, 0, 0), 0.075)
    supports = [box(0.08, 0.08, H + 0.38, (2.45, y, (H + 0.38) / 2), 'frame') for y in (-0.75, 0.75)]
    supports += [box(0.30, 0.30, 0.02, (2.45, y, 0.01), 'frame') for y in (-0.75, 0.75)]
    pipe_obj = join(pipes + [hdr_fl], 'pipes')
    valve_obj = join(valves, 'valves')
    sup = join(supports, 'BODY_supports')
    # inlet pipe through the -X wall
    inlet = join([pipe_path([(-HS - 0.4, 0, 0.75), (-HS + 0.3, 0, 0.75)], 0.11, mat='galv', name='inl'),
                  parts.flange_pair((-HS - 0.4, 0, 0.75), (1, 0, 0), 0.11)], 'inlet')

    # guide-rail tops + chain hooks in each pump bay (rails continue down into the well)
    gr = []
    for y in (-0.75, 0.75):
        for s in (-0.05, 0.05):
            gr.append(cyl(0.024, 0.25, (1.15, y + s, H - 0.05), 'Z', 'stainless', verts=12))
        gr.append(box(0.08, 0.18, 0.03, (1.15, y, H + 0.02), 'frame'))
    gr = join(gr, 'guide_rails')

    # --- pump-lifting davit with chain hoist --------------------------------------------------
    dv = Vector((1.85, -1.75, H))
    post = cyl(0.07, 2.2, (dv.x, dv.y, H + 1.1), 'Z', 'safety', verts=16)
    base = box(0.35, 0.35, 0.025, (dv.x, dv.y, H + 0.012), 'frame')
    jib = rod((dv.x, dv.y, H + 2.15), (dv.x - 0.6, dv.y + 1.0, H + 2.15), 0.05, 'safety', verts=12)
    brace = rod((dv.x, dv.y, H + 1.6), (dv.x - 0.35, dv.y + 0.58, H + 2.12), 0.025, 'safety', verts=8)
    hoist = box(0.16, 0.22, 0.26, (dv.x - 0.6, dv.y + 1.0, H + 1.93), 'safety', bevel=0.02)
    chain = rod((dv.x - 0.6, dv.y + 1.0, H + 1.8), (dv.x - 0.6, dv.y + 1.0, H + 1.0), 0.008, 'galv', verts=6)
    hook = lib.torus(0.03, 0.007, (dv.x - 0.6, dv.y + 1.0, H + 0.97), rot=(PI / 2, 0, 0), mat='galv', major=12, minor=6)
    davit = join([post, base, jib, brace, hoist, chain, hook], 'BODY_davit')

    # level control: float-switch bracket on the inlet side + panel post
    fs = [box(0.5, 0.06, 0.04, (-HS + 0.35, -1.2, H + 0.05), 'galv')]
    for i, z in enumerate((0.95, 0.75, 0.5, 0.3)):
        fs.append(rod((-HS + 0.55 - i * 0.07, -1.2, H + 0.05), (-HS + 0.55 - i * 0.07, -1.2, z), 0.006, 'rubber',
                      verts=6))
        fs.append(lib.sphere(0.045, (-HS + 0.55 - i * 0.07, -1.2, z - 0.04), 'safety', seg=10, rings=6, scale=(1, 1, 1.4)))
    lc = join(fs, 'floats')
    panel_post = cyl(0.04, 1.4, (-HS - 0.35, -HS + 0.4, 0.7), 'Z', 'galv', verts=12)
    panel = box(0.12, 0.45, 0.55, (-HS - 0.35, -HS + 0.4, 1.4), 'plate', bevel=0.02)
    panel_obj = join([panel_post, panel], 'BODY_panel')
    lamp = lib.sphere(0.04, (-HS - 0.35, -HS + 0.4, 1.72), 'status', seg=14, rings=7, name='STATUS_LAMP')

    # liquid
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    w = bpy.context.object
    w.scale = (S - 2 * T - 0.004, S - 2 * T - 0.004, 1)
    lib.apply_xf(w)
    w.name = 'WATER_surface'
    set_mat(w, 'water')
    w.location = (0, 0, 0.8)
    lib.EXTRA_META['water'] = {'min': 0.15, 'max': H - 0.12}

    port('in', (-HS - 0.4, 0, 0.75), (-1, 0, 0))
    port('out', (2.775, 0, H + 0.45), (1, 0, 0))
    return finalize('sump', smooth_angle=35)


if __name__ == '__main__':
    lib.main_guard(build)
