"""
Shared helpers for GearCast GLB model scripts (Blender 5.x, run headless).

Authoring convention (Blender space): metres, Z up, flow along +X (inlet -X, outlet +X).
glTF export converts to three.js Y-up:  three(x, y, z) = blender(x, z, -y).
So the Blender -Y side ends up facing the default three.js camera (+Z).

Node naming contract with src/models (the React wrappers):
  BODY*         static body meshes  -> fault pulse / hover tint
  ROTOR*        spins about extras.axis ('x'|'y'|'z', three.js local) at extras.speed rad/s when running
  SHAKE*        oscillates along extras.dir (three.js) with extras.amp metres when running
  STATUS_LAMP   lamp lens, material recoloured with statusColor (+ glow sprite added at runtime)
  STATUS_BAND*  emissive accent band recoloured with statusColor
  WATER*        liquid surface; wrapper swaps in the animated water material and sets height from level
"""
import bpy
import math
import json
import os
import sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
OUT_GLB = os.path.join(APP, 'public', 'models')
OUT_META = os.path.join(HERE, 'meta')

PI = math.pi
AXIS_ROT = {'X': (0, PI / 2, 0), 'Y': (PI / 2, 0, 0), 'Z': (0, 0, 0)}
B2T_AXIS = {'X': 'x', 'Z': 'y', 'Y': 'z'}

# name: (hex sRGB, metallic, roughness, emissive)
PALETTE = {
    'pump':      ('#4d667b', 0.35, 0.42, False),
    'motor':     ('#58616b', 0.35, 0.45, False),
    'process':   ('#5f6d78', 0.30, 0.50, False),
    'frame':     ('#363d44', 0.40, 0.55, False),
    'steel':     ('#8e979f', 0.75, 0.38, False),
    'stainless': ('#c4ccd3', 0.85, 0.30, False),
    'galv':      ('#9aa3a9', 0.60, 0.50, False),
    'concrete':  ('#8f8a82', 0.00, 0.92, False),
    'concrete2': ('#a39d94', 0.00, 0.90, False),
    'rubber':    ('#18191c', 0.00, 0.85, False),
    'dark':      ('#0b0d10', 0.00, 0.95, False),
    'safety':    ('#c99a2e', 0.20, 0.50, False),
    'spring':    ('#8a3c2c', 0.30, 0.50, False),
    'ochre':     ('#a77a3e', 0.30, 0.50, False),
    'marker':    ('#d9dee3', 0.10, 0.50, False),
    'glass':     ('#c8a24a', 0.10, 0.15, False),
    'water':     ('#1d3a40', 0.10, 0.10, False),
    'status':    ('#ffffff', 0.00, 0.40, True),
    'pump2':     ('#435a6d', 0.35, 0.48, False),
    'motor2':    ('#6b747d', 0.40, 0.40, False),
    'castiron':  ('#55595d', 0.55, 0.62, False),
    'brass':     ('#b08d4a', 0.85, 0.35, False),
    'sight':     ('#d9b25a', 0.00, 0.08, False),
    'plate':     ('#b9c0c6', 0.70, 0.35, False),
    'mesh':      ('#7d868d', 0.80, 0.45, False),
    'cladding':  ('#6f7c86', 0.30, 0.55, False),
    'roof':      ('#3d454c', 0.40, 0.55, False),
    'window':    ('#1b2630', 0.30, 0.15, False),
    'wood':      ('#8c6b48', 0.00, 0.80, False),
    'carton':    ('#9c8261', 0.00, 0.90, False),
    'liquor':    ('#4a3e2c', 0.05, 0.20, False),
    'grating':   ('#6c747a', 0.60, 0.55, False),
}

PORTS = []
EXTRA_META = {}


def srgb2lin(h):
    h = h.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out + [1.0]


_BUILD = ['0']


def M(name):
    # material names are exported to glTF unprefixed; in the live session we prefix to avoid clashes
    mname = ('gc_' + name) if LIVE else name
    m = bpy.data.materials.get(mname)
    if m and m.get('gc_built') == _BUILD[0]:
        return m
    hexc, metal, rough, emit = PALETTE[name]
    if m is None:
        m = bpy.data.materials.new(mname)
    m['gc_built'] = _BUILD[0]
    m.use_nodes = True
    p = [n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'][0]
    p.inputs['Base Color'].default_value = srgb2lin(hexc)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if emit:
        p.inputs['Emission Color'].default_value = srgb2lin(hexc)
        p.inputs['Emission Strength'].default_value = 1.0
    return m


LIVE = not bpy.app.background


def reset():
    """Headless: factory-reset. Live GUI: clear only the 'GearCast' scene's objects (never other scenes)."""
    PORTS.clear()
    EXTRA_META.clear()
    _BUILD[0] = repr(__import__('time').time())
    if not LIVE:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        return
    sc = bpy.data.scenes.get('GearCast')
    if sc is None:
        raise RuntimeError("live mode requires a scene named 'GearCast'")
    bpy.context.window.scene = sc
    if sc.world is None:
        w = bpy.data.worlds.get('gc_world') or bpy.data.worlds.new('gc_world')
        w.use_nodes = True
        bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
        bg.inputs[0].default_value = (0.05, 0.06, 0.075, 1)
        bg.inputs[1].default_value = 1.0
        sc.world = w
    for o in list(sc.objects):
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Curve):
                bpy.data.curves.remove(data)
    for m in list(bpy.data.materials):
        if m.name.startswith('gc_') and m.users == 0:
            bpy.data.materials.remove(m)


def _active(o):
    for s in bpy.context.selected_objects:
        s.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def apply_mods(o):
    _active(o)
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    return o


def apply_xf(o, location=False):
    _active(o)
    bpy.ops.object.transform_apply(location=location, rotation=True, scale=True)
    return o


def _finish(o, name, mat, bevel=0.0, seg=2, angle=40):
    o.name = name
    if o.data and hasattr(o.data, 'materials'):
        o.data.materials.clear()
        if mat:
            o.data.materials.append(M(mat))
    if bevel:
        apply_xf(o)
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width = bevel
        b.segments = seg
        b.limit_method = 'ANGLE'
        b.angle_limit = math.radians(angle)
        b.use_clamp_overlap = True
        apply_mods(o)
    return o


def cyl(r, h, loc=(0, 0, 0), axis='Z', mat='steel', verts=32, r2=None, bevel=0.0, seg=2, name='cyl', fill=True):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r if r2 is None else r2, depth=h,
                                    end_fill_type='NGON' if fill else 'NOTHING', location=loc, rotation=AXIS_ROT[axis])
    return _finish(bpy.context.object, name, mat, bevel, seg)


def box(sx, sy, sz, loc=(0, 0, 0), mat='steel', bevel=0.0, seg=2, rot=(0, 0, 0), name='box'):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = (sx, sy, sz)
    apply_xf(o)
    return _finish(o, name, mat, bevel, seg)


def torus(R, r, loc=(0, 0, 0), rot=(0, 0, 0), mat='steel', major=32, minor=8, name='torus'):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=major, minor_segments=minor,
                                     location=loc, rotation=rot)
    return _finish(bpy.context.object, name, mat)


def sphere(r, loc=(0, 0, 0), mat='steel', seg=16, rings=8, scale=(1, 1, 1), name='sphere'):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=rings, location=loc)
    o = bpy.context.object
    o.scale = scale
    apply_xf(o)
    return _finish(o, name, mat)


def lathe(profile, loc=(0, 0, 0), axis='Z', mat='steel', steps=32, name='lathe'):
    """profile: list of (radius, height) along the local axis, revolved 360 deg."""
    me = bpy.data.meshes.new(name)
    verts = [(r, 0, z) for r, z in profile]
    edges = [(i, i + 1) for i in range(len(verts) - 1)]
    me.from_pydata(verts, edges, [])
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    s = o.modifiers.new('screw', 'SCREW')
    s.angle = 2 * PI
    s.steps = steps
    s.render_steps = steps
    s.axis = 'Z'
    s.use_merge_vertices = True
    s.merge_threshold = 1e-4
    s.use_normal_calculate = True
    apply_mods(o)
    o.rotation_euler = AXIS_ROT[axis]
    o.location = loc
    apply_xf(o)
    return _finish(o, name, mat)


def curve_tube(points, r, mat='rubber', name='tube', res=8, closed=False):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = 2
    cu.resolution_u = res
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    sp.use_cyclic_u = closed
    cu.use_fill_caps = True
    o = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(o)
    return to_mesh(o, name, mat)


def to_mesh(o, name, mat):
    _active(o)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.object
    return _finish(o, name, mat)


def boolean(o, cutters, op='DIFFERENCE', solver='EXACT'):
    """Boolean with clean-up; falls back to the Manifold solver if Exact collapses the mesh."""
    if not isinstance(cutters, (list, tuple)):
        cutters = [cutters]
    c = join(cutters, '_cutter') if len(cutters) > 1 else cutters[0]
    backup = o.data.copy()
    for sv in ((solver, 'MANIFOLD') if solver != 'MANIFOLD' else ('MANIFOLD',)):
        m = o.modifiers.new('bool', 'BOOLEAN')
        m.operation = op
        m.solver = sv
        m.object = c
        apply_mods(o)
        if len(o.data.polygons) > 0:
            break
        old = o.data
        o.data = backup.copy()
        bpy.data.meshes.remove(old)
    bpy.data.meshes.remove(backup)
    bpy.data.objects.remove(c, do_unlink=True)
    return o


def join(objs, name):
    objs = [o for o in objs if o is not None]
    for o in objs:
        apply_mods(o)
    _active(objs[0])
    for o in objs[1:]:
        o.select_set(True)
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    return o


def dup(o, loc=None, rot=None, name=None):
    n = o.copy()
    n.data = o.data.copy()
    bpy.context.collection.objects.link(n)
    if loc is not None:
        n.location = loc
    if rot is not None:
        n.rotation_euler = rot
    if name:
        n.name = name
    return n


def radial(make, count, radius, axis='Z', center=(0, 0, 0), phase=0.0, name='radial'):
    """make(angle, pos) -> object; positions placed on a circle around `axis` through `center`."""
    objs = []
    cx, cy, cz = center
    for i in range(count):
        a = phase + 2 * PI * i / count
        if axis == 'Z':
            p = (cx + radius * math.cos(a), cy + radius * math.sin(a), cz)
        elif axis == 'X':
            p = (cx, cy + radius * math.cos(a), cz + radius * math.sin(a))
        else:
            p = (cx + radius * math.cos(a), cy, cz + radius * math.sin(a))
        objs.append(make(a, p))
    return join(objs, name)


def bolt_ring(count, radius, axis, center, size=0.012, h=0.04, mat='steel', phase=None, name='bolts'):
    ph = PI / count if phase is None else phase
    return radial(lambda a, p: cyl(size, h, p, axis, mat, verts=6), count, radius, axis, center, ph, name)


def loft(rings, name='loft', mat='steel', cap_start=True, cap_end=True):
    """Skin a list of equal-length closed vertex rings into a tube mesh (quads), optional fan caps."""
    import bmesh
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vr = [[bm.verts.new(v) for v in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(vr[:-1], vr[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap_start:
        bm.faces.new(list(reversed(vr[0])))
    if cap_end:
        bm.faces.new(vr[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return _finish(o, name, mat)


def mesh_from(verts, faces, name='mesh', mat='steel'):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return _finish(o, name, mat)


def bevel(o, width, seg=2, angle=40, only_vertices=False):
    b = o.modifiers.new('bevel', 'BEVEL')
    b.width = width
    b.segments = seg
    b.limit_method = 'ANGLE'
    b.angle_limit = math.radians(angle)
    b.use_clamp_overlap = True
    if only_vertices:
        b.affect = 'VERTICES'
    return apply_mods(o)


def solidify(o, t, offset=-1):
    m = o.modifiers.new('solid', 'SOLIDIFY')
    m.thickness = t
    m.offset = offset
    m.use_even_offset = True
    return apply_mods(o)


def array(o, count, offset, name=None):
    m = o.modifiers.new('arr', 'ARRAY')
    m.count = count
    m.use_relative_offset = False
    m.use_constant_offset = True
    m.constant_offset_displacement = offset
    apply_mods(o)
    if name:
        o.name = name
    return o


def set_mat(o, mat):
    o.data.materials.clear()
    o.data.materials.append(M(mat))
    return o


def port(pid, loc, direction):
    PORTS.append((pid, Vector(loc), Vector(direction)))


def set_origin(o, point):
    bpy.context.scene.cursor.location = point
    _active(o)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = (0, 0, 0)


def rotor(o, axis_point, axis='X', speed=12.0):
    """Mark object as ROTOR spinning about blender `axis` through axis_point."""
    set_origin(o, axis_point)
    o['axis'] = B2T_AXIS[axis]
    o['speed'] = speed
    return o


def _smooth(o, angle=40):
    _active(o)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle), keep_sharp_edges=True)
    w = o.modifiers.new('wn', 'WEIGHTED_NORMAL')
    w.keep_sharp = True
    w.weight = 50
    apply_mods(o)


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def preview_rig(lo, hi):
    """Live-only: key/fill/rim lights + dark ground so `look` renders resemble the app."""
    size = max((hi - lo).length, 1.0)
    def light(name, kind, energy, loc, rot, sz=1.0):
        d = bpy.data.lights.new(name, kind)
        d.energy = energy
        if kind == 'AREA':
            d.size = sz
        o = bpy.data.objects.new(name, d)
        bpy.context.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = rot
    light('_rig_key', 'SUN', 3.0, (0, 0, 10), (math.radians(50), 0, math.radians(-35)))
    light('_rig_fill', 'SUN', 0.8, (0, 0, 10), (math.radians(60), 0, math.radians(140)))
    light('_rig_rim', 'SUN', 1.2, (0, 0, 10), (math.radians(-70), 0, math.radians(10)))
    bpy.ops.mesh.primitive_plane_add(size=size * 6, location=(0, 0, -0.001))
    g = bpy.context.object
    g.name = '_rig_ground'
    g.data.materials.append(M('dark'))


def finalize(kind, smooth_angle=40):
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in meshes:
        apply_mods(o)
        _smooth(o, smooth_angle)
    # centre on x/y, sit on z=0 (based on world bbox)
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    shift = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    for o in bpy.context.scene.objects:
        if o.parent is None:
            o.location += shift
    for o in meshes:
        if not o.name.startswith(('ROTOR', 'SHAKE', 'WATER')):
            apply_xf(o, location=True)
    total = sum(tris(o) for o in meshes)
    size = hi - lo
    r3 = lambda v: [round(x, 3) for x in v]
    meta = {
        'kind': kind,
        'footprint': r3([size.x, size.y]),
        'height': round(size.z, 3),
        'ports': [{'id': pid, 'position': r3([(p + shift).x, (p + shift).z, -(p + shift).y]),
                   'direction': r3([d.x, d.z, -d.y])} for pid, p, d in PORTS],
        'tris': total,
    }
    meta.update(EXTRA_META)
    print('BUILT', kind, 'tris', total, 'footprint', meta['footprint'], 'height', meta['height'])
    for o in meshes:
        print('   ', o.name, tris(o))
    if LIVE:  # live GUI session: inspect only, never write build outputs from here
        preview_rig(lo + shift, hi + shift)
        return meta
    os.makedirs(OUT_GLB, exist_ok=True)
    os.makedirs(OUT_META, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_GLB, kind + '.glb'), export_format='GLB',
                              export_apply=True, export_yup=True, export_extras=True, export_cameras=False,
                              export_lights=False, export_materials='EXPORT')
    with open(os.path.join(OUT_META, kind + '.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    return meta


def main_guard(build):
    try:
        build()
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
