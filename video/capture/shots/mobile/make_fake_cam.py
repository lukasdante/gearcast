"""Builds the fake camera feed (y4m, 1280x720) from qr-label.png for the QR scan shot (03-a).
   ~1.1 s hand-held pan-in with motion blur (not decodable), then the label held steady with slight shake.
   usage: python3 make_fake_cam.py <qr-label.png> <out.y4m>"""
import math, subprocess, sys
from PIL import Image, ImageFilter
src, out = sys.argv[1], sys.argv[2]
W, H, FPS, SECS = 1280, 720, 15, 5
lab = Image.open(src).convert('RGB')
# the in-app camera box crops the 16:9 feed to ~4:3, so centre the QR code (label px ~290-720 x 285-715) in the frame
QX, QY = 505, 500
bg = lab.getpixel((5, 5))
ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                       '-pix_fmt', 'yuv420p', '-f', 'yuv4mpegpipe', out], stdin=subprocess.PIPE)
n = FPS * SECS
pan = int(FPS * 1.1)
for i in range(n):
    t = i / FPS
    if i < pan:
        k = 1 - (i / pan) ** 0.6           # 1 -> 0
        dx, dy, blur, zoom = -520 * k, 140 * k, 14 * k + 1.5, 1 + 0.25 * k
    else:
        dx, dy, blur, zoom = 4 * math.sin(t * 7.1), 3 * math.sin(t * 5.3 + 1), 0, 1
    im = lab if zoom == 1 else lab.resize((round(lab.width * zoom), round(lab.height * zoom)))
    frame = Image.new('RGB', (W, H), bg)
    frame.paste(im, (round(W / 2 - QX * zoom + dx), round(H / 2 - QY * zoom + dy)))
    if blur > 0: frame = frame.filter(ImageFilter.GaussianBlur(blur))
    ff.stdin.write(frame.tobytes())
ff.stdin.close(); ff.wait()
print('wrote', out, n, 'frames')
