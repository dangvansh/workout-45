"""Draws the app icons as PNGs using only the Python standard library.

Run from the project folder:  python tools/make_icons.py
"""
import math
import os
import struct
import zlib

BG = (17, 16, 14)
TRACK = (54, 49, 42)
ORANGE = (224, 102, 45)
MUSTARD = (227, 169, 47)
TEAL = (70, 179, 167)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")


def write_png(path, size, pixels):
    raw = b"".join(b"\x00" + bytes(pixels[y * size * 3:(y + 1) * size * 3]) for y in range(size))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def cover(d):
    """Anti-aliased coverage for a signed distance d (in pixels, negative = inside)."""
    return max(0.0, min(1.0, 0.5 - d))


def draw(size, scale):
    """scale = how much of the canvas the artwork uses (smaller for maskable icons)."""
    px = bytearray(size * size * 3)
    c = size / 2
    r = size * 0.33 * scale
    w = size * 0.085 * scale
    dot = size * 0.085 * scale
    arc_end = 2 * math.pi * 0.78  # orange arc covers ~78% of the ring, clockwise from 12 o'clock
    cap = w / 2
    end_pts = [(c, c - r), (c + r * math.sin(arc_end), c - r * math.cos(arc_end))]
    teal_a0, teal_a1 = arc_end + 0.25, 2 * math.pi - 0.25
    for y in range(size):
        for x in range(size):
            fx, fy = x + 0.5, y + 0.5
            dx, dy = fx - c, fy - c
            dist = math.hypot(dx, dy)
            ang = math.atan2(dx, -dy) % (2 * math.pi)
            col = BG
            ring_d = abs(dist - r) - w / 2
            col = mix(col, TRACK, cover(ring_d))
            # teal segment (the "rest of the plan")
            if teal_a0 <= ang <= teal_a1:
                col = mix(col, TEAL, cover(ring_d) * 0.9)
            # orange progress arc with round caps
            d_arc = ring_d if ang <= arc_end else 1e9
            for ex, ey in end_pts:
                d_arc = min(d_arc, math.hypot(fx - ex, fy - ey) - cap)
            col = mix(col, ORANGE, cover(d_arc))
            col = mix(col, MUSTARD, cover(dist - dot))
            i = (y * size + x) * 3
            px[i:i + 3] = bytes(col)
    return px


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, size, scale in [
        ("icon-192.png", 192, 1.0),
        ("icon-512.png", 512, 1.0),
        ("icon-maskable-512.png", 512, 0.78),
        ("apple-touch-icon.png", 180, 1.0),
    ]:
        write_png(os.path.join(OUT, name), size, draw(size, scale))
        print("wrote", name)


if __name__ == "__main__":
    main()
