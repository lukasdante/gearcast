#!/usr/bin/env python3
"""Talk to the running Blender GUI through the blender-mcp add-on socket (127.0.0.1:9876).

Usage:
  python3 blender_live.py info
  python3 blender_live.py exec path/to/code.py        # runs the code inside the live Blender
  python3 blender_live.py exec -c "print(bpy.data.objects[:])"
  python3 blender_live.py shot out.png [max_size]     # viewport screenshot

Rule: work only inside a scene named 'GearCast' (create it with bpy.data.scenes.new if missing and
set it as window.scene). Never delete or modify objects in other scenes and never save the user's .blend.
"""
import json
import os
import socket
import sys

HOST, PORT = '127.0.0.1', 9876


def call(cmd_type, params=None, timeout=180):
    s = socket.create_connection((HOST, PORT), timeout=timeout)
    s.sendall(json.dumps({"type": cmd_type, "params": params or {}}).encode())
    buf = b''
    while True:
        chunk = s.recv(1 << 16)
        if not chunk:
            break
        buf += chunk
        try:
            return json.loads(buf)
        except json.JSONDecodeError:
            continue
    return json.loads(buf)


def main(argv):
    if not argv or argv[0] == 'info':
        print(json.dumps(call('get_scene_info'), indent=2))
    elif argv[0] == 'exec':
        code = argv[2] if argv[1] == '-c' else open(argv[1]).read()
        print(json.dumps(call('execute_code', {'code': code}), indent=2))
    elif argv[0] == 'shot':
        out = os.path.abspath(argv[1])
        params = {'filepath': out, 'format': 'png'}
        if len(argv) > 2:
            params['max_size'] = int(argv[2])
        print(json.dumps(call('get_viewport_screenshot', params), indent=2))
    else:
        print(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])
