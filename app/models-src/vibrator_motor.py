"""
Vibrator (exciter) motor, 0.75 kW 4-pole, foot-mounted, eccentric weights under domed end covers.
Reference: app/public/figures/FIG-05. Shown on a short section of drive-beam flange plate.

Blender space: Z up, motor axis along Y (across the screen), footprint centred.
Run:  blender -b --factory-startup --python app/models-src/vibrator_motor.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import box, sphere, cyl, join, finalize, reset  # noqa: E402
from vib import vibrator_motor  # noqa: E402


def build():
    reset()
    plate = box(0.34, 0.46, 0.016, (0, 0, 0.008), 'frame', bevel=0.003, name='plate')
    flange = box(0.30, 0.42, 0.02, (0, 0, 0.026), 'process', bevel=0.004, name='flange')
    beam = join([plate, flange], 'BODY_beam')
    body, hw, axz = vibrator_motor(0, 0, 0.036, 'vm', paint='motor')
    body = join([body, hw], 'SHAKE_motor')
    body['dir'] = [0.0, 1.0, 0.0]
    body['amp'] = 0.0015
    body['freq'] = 14.0
    lib.set_origin(body, (0, 0, axz))
    lamp_base = cyl(0.014, 0.01, (-0.035, 0.035, axz + 0.088 + 0.065), 'Z', 'rubber', verts=14, name='lampbase')
    lamp = sphere(0.012, (-0.035, 0.035, axz + 0.088 + 0.072), 'status', seg=14, rings=7, scale=(1, 1, 0.8),
                  name='STATUS_LAMP')
    return finalize('vibrator_motor')


if __name__ == '__main__':
    lib.main_guard(build)
