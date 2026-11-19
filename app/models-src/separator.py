"""
Oil & grease separator: steel gravity (API-type) separator tank, 4.0 x 1.8 x 1.2 m, raised on legs
with two sludge hoppers and drain valves underneath.

Parts: tank shell with external stiffener ribs and top flange, inlet distribution chamber with
baffle, open separation bay (liquid + oil film visible), rotary slotted skimmer pipe with
handwheel, under/over-flow baffles, covered outlet chamber with checker-plate lids, oil drum on a
bund pallet, inlet (-X) and outlet (+X) nozzles, sludge hoppers with gate valves, legs and bracing.

Blender space: Z up.
Run:  blender -b --factory-startup --python app/models-src/separator.py
"""
import os
import sys
import math
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import cyl, box, loft, join, bevel, set_mat, port, finalize, reset, rod, pipe_path, solidify, PI  # noqa: E402
import parts  # noqa: E402

LX, LY, HT = 4.0, 1.8, 1.2
Z0 = 0.75              # tank floor height (hoppers + legs below)
hx, hy = LX / 2, LY / 2


def rect(cx, cy, hx_, hy_, z):
    return [(cx - hx_, cy - hy_, z), (cx + hx_, cy - hy_, z), (cx + hx_, cy + hy_, z), (cx - hx_, cy + hy_, z)]


def build():
    reset()
    # tank shell: open box (walls + floor with hopper openings) via solidified mesh
    shell = loft([rect(0, 0, hx, hy, Z0), rect(0, 0, hx, hy, Z0 + HT)], 'shell', 'process', cap_start=True,
                 cap_end=False)
    solidify(shell, 0.010, offset=1)
    ribs = []
    for x in (-1.5, -0.5, 0.5, 1.5):
        for sy in (-1, 1):
            ribs.append(box(0.08, 0.10, HT, (x, sy * (hy + 0.05), Z0 + HT / 2), 'process'))
    for sx in (-1, 1):
        ribs.append(box(0.10, 0.08, HT, (sx * (hx + 0.05), 0.55, Z0 + HT / 2), 'process'))
        ribs.append(box(0.10, 0.08, HT, (sx * (hx + 0.05), -0.55, Z0 + HT / 2), 'process'))
    top = [box(LX + 0.2, 0.10, 0.012, (0, sy * (hy + 0.05), Z0 + HT), 'process') for sy in (-1, 1)]
    top += [box(0.10, LY, 0.012, (sx * (hx + 0.05), 0, Z0 + HT), 'process') for sx in (-1, 1)]
    belt = [box(LX + 0.2, 0.12, 0.08, (0, sy * (hy + 0.05), Z0 + 0.4), 'process') for sy in (-1, 1)]
    # internal baffles: inlet distribution, under-flow oil retention, outlet weir
    baffles = [box(0.01, LY, HT - 0.25, (-hx + 0.6, 0, Z0 + 0.2 + (HT - 0.25) / 2), 'process'),
               box(0.01, LY, HT - 0.3, (hx - 0.9, 0, Z0 + 0.3 + (HT - 0.3) / 2), 'process'),
               box(0.01, LY, 0.7, (hx - 0.55, 0, Z0 + 0.35), 'process')]
    # hoppers under the separation bay
    hoppers = []
    for cx in (-0.6, 0.6):
        hp = loft([rect(cx, 0, 0.12, 0.12, 0.35), rect(cx, 0, 0.58, 0.85, Z0)], 'hp', 'process', cap_start=True,
                  cap_end=False)
        solidify(hp, 0.008)
        hoppers.append(hp)
        hoppers.append(cyl(0.05, 0.12, (cx, 0, 0.29), 'Z', 'process', verts=16))
    tank = join([shell] + ribs + top + belt + baffles + hoppers, 'BODY_tank')
    valves = [parts.gate_valve((cx, 0, 0.16), (0, 0, -1), r=0.04, name='dv') for cx in (-0.6, 0.6)]
    for v in valves:
        pass
    # legs + bracing
    legs = []
    for x in (-hx + 0.1, -0.0, hx - 0.1):
        for sy in (-1, 1):
            legs.append(box(0.10, 0.10, Z0, (x, sy * (hy - 0.05), Z0 / 2), 'frame', bevel=0.005))
            legs.append(box(0.22, 0.22, 0.015, (x, sy * (hy - 0.05), 0.0075), 'frame'))
    for sy in (-1, 1):
        legs.append(rod((-hx + 0.1, sy * (hy - 0.05), 0.1), (-0.0, sy * (hy - 0.05), Z0 - 0.08), 0.02, 'frame', verts=6))
        legs.append(rod((hx - 0.1, sy * (hy - 0.05), 0.1), (0.0, sy * (hy - 0.05), Z0 - 0.08), 0.02, 'frame', verts=6))
    stand = join(legs, 'BODY_stand')

    # covers over inlet chamber and outlet chamber (checker plate) with handles
    lids = [box(0.62, LY + 0.02, 0.008, (-hx + 0.31, 0, Z0 + HT + 0.01), 'plate', bevel=0.003),
            box(0.9, LY + 0.02, 0.008, (hx - 0.45, 0, Z0 + HT + 0.01), 'plate', bevel=0.003)]
    for x in (-hx + 0.31, hx - 0.45):
        for y in (-0.45, 0.45):
            lids.append(lib.curve_tube([(x - 0.1, y, Z0 + HT + 0.014), (x - 0.08, y, Z0 + HT + 0.05),
                                        (x + 0.08, y, Z0 + HT + 0.05), (x + 0.1, y, Z0 + HT + 0.014)],
                                       0.008, mat='steel', res=2, bevel_res=0))
    lid = join(lids, 'lids')

    # rotary slotted skimmer pipe across the bay with handwheel + oil outlet into drum
    zs = Z0 + HT - 0.16
    skim = cyl(0.075, LY + 0.25, (0.95, 0, zs), 'Y', 'stainless', verts=20)
    slot = box(0.03, LY - 0.1, 0.04, (0.95, 0, zs + 0.07), 'dark')
    wheel = lib.torus(0.16, 0.014, (0.95, -hy - 0.2, zs), rot=(PI / 2, 0, 0), mat='safety', major=20, minor=6)
    spokes = [rod((0.95, -hy - 0.2, zs), (0.95 + 0.16 * math.cos(a), -hy - 0.2, zs + 0.16 * math.sin(a)), 0.01,
                  'safety', verts=6) for a in (0, 2 * PI / 3, 4 * PI / 3)]
    oil_line = pipe_path([(0.95, hy + 0.12, zs), (0.95, hy + 0.35, zs), (0.95, hy + 0.35, 0.75)], 0.05, bend=0.12,
                         mat='stainless', name='oil')
    skimmer = join([skim, slot, wheel, oil_line] + spokes, 'skimmer')
    # oil drum on a spill pallet
    pallet = box(0.8, 0.8, 0.15, (0.95, hy + 0.55, 0.075), 'safety', bevel=0.01)
    drum = lib.lathe([(0.0, 0.15), (0.29, 0.15), (0.29, 0.17), (0.28, 0.18), (0.28, 0.42), (0.295, 0.43),
                      (0.28, 0.44), (0.28, 0.68), (0.295, 0.69), (0.28, 0.70), (0.28, 0.98), (0.29, 0.99),
                      (0.29, 1.03), (0.0, 1.03)], loc=(0.95, hy + 0.55, 0), mat='ochre', steps=28, name='drum')
    drum_obj = join([pallet, drum], 'drum')

    # inlet / outlet nozzles
    nin = parts.nozzle((-hx - 0.35, 0, Z0 + HT - 0.3), '-X', r=0.084, length=0.38, mat='process', name='n_in')
    nout = parts.nozzle((hx + 0.35, 0, Z0 + HT - 0.45), 'X', r=0.084, length=0.38, mat='process', name='n_out')
    noz = join([nin, nout], 'nozzles')
    band = box(LX - 0.3, 0.008, 0.05, (0, -(hy + 0.104), Z0 + HT - 0.1), 'status')
    band.name = 'STATUS_BAND'

    # liquid with a darker oil film toward the skimmer
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    w = bpy.context.object
    w.scale = (hx - 0.9 - (-hx + 0.6) - 0.02, LY - 0.02, 1)
    lib.apply_xf(w)
    w.location = ((-hx + 0.6 + hx - 0.9) / 2, 0, Z0 + HT - 0.2)
    lib.apply_xf(w, location=True)
    w.name = 'WATER_surface'
    set_mat(w, 'liquor')
    # shift origin to surface height so the wrapper can drive y
    lib.set_origin(w, (0, 0, Z0 + HT - 0.2))
    lib.EXTRA_META['water'] = {'min': Z0 + 0.4, 'max': Z0 + HT - 0.12}

    port('in', (-hx - 0.35, 0, Z0 + HT - 0.3), (-1, 0, 0))
    port('out', (hx + 0.35, 0, Z0 + HT - 0.45), (1, 0, 0))
    return finalize('separator', smooth_angle=35)


if __name__ == '__main__':
    lib.main_guard(build)
