"""生成 PWA 图标（纯标准库，无第三方依赖）。
用法：python tools/gen_icons.py
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")


def clamp(v):
    return max(0.0, min(1.0, v))


def smooth(a, b, x):
    t = clamp((x - a) / (b - a))
    return t * t * (3 - 2 * t)


def seg_dist(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def make(size):
    cx = cy = size / 2
    aa = max(1.0, size / 220.0)
    r_out, r_in = size * .335, size * .275
    data = bytearray()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            r = int(74 + (30 - 74) * t)
            g = int(148 + (94 - 148) * t)
            b = int(255 + (214 - 255) * t)
            d = math.hypot(x - cx, y - cy)
            ring = smooth(r_in - aa, r_in + aa, d) * (1 - smooth(r_out - aa, r_out + aa, d))
            hw = size * .028
            hands = 1 - smooth(hw - aa, hw + aa, min(
                seg_dist(x, y, cx, cy, cx, cy - size * .21),
                seg_dist(x, y, cx, cy, cx + size * .16, cy + size * .10)))
            bell = 1 - smooth(size * .022 - aa, size * .022 + aa, min(
                seg_dist(x, y, size * .30, size * .19, size * .25, size * .27),
                seg_dist(x, y, size * .70, size * .19, size * .75, size * .27)))
            alpha = clamp(max(ring, hands, bell))
            r = int(r + (255 - r) * alpha)
            g = int(g + (255 - g) * alpha)
            b = int(b + (255 - b) * alpha)
            data += bytes((r, g, b))
    return data


def write_png(path, size):
    pixels = make(size)
    raw = b"".join(b"\x00" + bytes(pixels[y * size * 3:(y + 1) * size * 3]) for y in range(size))
    def chunk(tag, payload):
        return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", zlib.crc32(tag + payload) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
        write_png(os.path.join(OUT, name), size)
        print("generated", name)
