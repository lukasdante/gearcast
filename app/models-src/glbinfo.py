#!/usr/bin/env python3
"""Print node names / extras / materials of a GLB (sanity check for the naming contract)."""
import json, struct, sys
for p in sys.argv[1:]:
    b = open(p, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    print(p, len(b) // 1024, 'KB')
    for nd in j['nodes']:
        print('  ', nd.get('name'), nd.get('extras', ''), [round(x, 3) for x in nd.get('translation', [])])
    print('   mats:', [m['name'] for m in j.get('materials', [])])
