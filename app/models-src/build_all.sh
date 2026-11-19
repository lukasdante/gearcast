#!/usr/bin/env bash
# Rebuild every GLB headless, then regenerate src/models/kinds/meta.ts.
set -e
cd "$(dirname "$0")"
BLENDER=${BLENDER:-blender}
for k in pump_end_suction motor pump_submersible vibrating_screen vibrator_motor clarifier tank sump bio_reactor \
         separator discharge spare_rack building custom_box; do
  "$BLENDER" -b --factory-startup --python "$k.py" 2>&1 | grep -E "^BUILT|Error|Traceback" || true
done
python3 gen_meta.py
