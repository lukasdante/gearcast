"""
Custom block: a neutral 1.0 x 1.0 x 1.0 m packaged-equipment module for user-defined assets in the
plant builder (the app scales it with `scale`). Skid base with channel rails and lifting lugs,
panelled enclosure with a door, hinges, latch, vent grille and nameplate, status lamp, and small
flanged inlet (-X) / outlet (+X) nozzles.

Run:  blender -b --factory-startup --python app/models-src/custom_box.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import cyl, box, join, bevel, finalize, reset, PI  # noqa: E402
import parts  # noqa: E402


def build():
    reset()
    rails = [box(1.0, 0.08, 0.10, (0, s * 0.40, 0.05), 'frame', bevel=0.004) for s in (-1, 1)]
    cross = [box(0.07, 0.72, 0.08, (x, 0, 0.05), 'frame') for x in (-0.42, 0.0, 0.42)]
    lugs = [box(0.06, 0.012, 0.08, (x, s * 0.446, 0.10), 'frame') for x in (-0.45, 0.45) for s in (-1, 1)]
    skid = join(rails + cross + lugs, 'BODY_skid')
    enc = box(0.92, 0.80, 0.86, (0, 0, 0.10 + 0.43), 'process', bevel=0.025, seg=3)
    lid = box(0.96, 0.84, 0.04, (0, 0, 0.98), 'process', bevel=0.012)
    # door panel (proud) + hinges + latch on the -Y face
    door = box(0.70, 0.012, 0.66, (0.0, -0.405, 0.54), 'process', bevel=0.006)
    hinges = [cyl(0.012, 0.08, (-0.36, -0.415, z), 'Z', 'steel', verts=8) for z in (0.32, 0.76)]
    latch = box(0.03, 0.03, 0.12, (0.30, -0.42, 0.54), 'steel', bevel=0.005)
    grille = [box(0.012, 0.25, 0.012, (0.465, 0, 0.30 + i * 0.03), 'dark') for i in range(8)]
    body = join([enc, lid, door], 'BODY_enclosure')
    plate = box(0.18, 0.004, 0.10, (-0.12, -0.413, 0.80), 'plate', bevel=0.002)
    plate.name = 'nameplate'
    hw = join(hinges + [latch] + grille, 'hardware')
    nin = parts.nozzle((-0.58, 0, 0.42), '-X', r=0.045, length=0.14, mat='galv', name='n_in')
    nout = parts.nozzle((0.58, 0, 0.42), 'X', r=0.045, length=0.14, mat='galv', name='n_out')
    join([nin, nout], 'nozzles')
    band = box(0.925, 0.805, 0.03, (0, 0, 0.90), 'status')
    band.name = 'STATUS_BAND'
    lamp_base = cyl(0.03, 0.03, (0.35, 0.30, 1.015), 'Z', 'rubber', verts=14)
    lamp = lib.sphere(0.03, (0.35, 0.30, 1.04), 'status', seg=14, rings=7, name='STATUS_LAMP')
    lib.port('in', (-0.58, 0, 0.42), (-1, 0, 0))
    lib.port('out', (0.58, 0, 0.42), (1, 0, 0))
    return finalize('custom_box', smooth_angle=35)


if __name__ == '__main__':
    lib.main_guard(build)
