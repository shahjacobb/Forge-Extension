#!/usr/bin/env python3
from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


def png(size: int, pixels: list[tuple[int, int, int, int]]) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b"".join(
        b"\x00" + b"".join(struct.pack("BBBB", *pixel) for pixel in pixels[row * size : (row + 1) * size])
        for row in range(size)
    )
    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)),
            chunk(b"IDAT", zlib.compress(raw, 9)),
            chunk(b"IEND", b""),
        ]
    )


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return (
        int(a[0] + (b[0] - a[0]) * t),
        int(a[1] + (b[1] - a[1]) * t),
        int(a[2] + (b[2] - a[2]) * t),
    )


def sd_round_rect(x: float, y: float, hw: float, hh: float, r: float) -> float:
    ax, ay = abs(x) - hw + r, abs(y) - hh + r
    return math.hypot(max(ax, 0), max(ay, 0)) + min(max(ax, ay), 0) - r


def sd_circle(x: float, y: float, r: float) -> float:
    return math.hypot(x, y) - r


def sd_ring(x: float, y: float, r: float, w: float) -> float:
    return abs(math.hypot(x, y) - r) - w


def sd_triangle(px: float, py: float, a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> float:
    def cross(q: tuple[float, float], w: tuple[float, float], p: tuple[float, float]) -> float:
        return (p[0] - q[0]) * (w[1] - q[1]) - (p[1] - q[1]) * (w[0] - q[0])

    d1 = cross(a, b, (px, py))
    d2 = cross(b, c, (px, py))
    d3 = cross(c, a, (px, py))
    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    inside = not (has_neg and has_pos)

    def dist_seg(p: tuple[float, float], q: tuple[float, float], w: tuple[float, float]) -> float:
        vx, vy = w[0] - q[0], w[1] - q[1]
        llen = vx * vx + vy * vy
        t = 0 if llen == 0 else max(0, min(1, ((p[0] - q[0]) * vx + (p[1] - q[1]) * vy) / llen))
        return math.hypot(p[0] - (q[0] + vx * t), p[1] - (q[1] + vy * t))

    edge = min(dist_seg((px, py), a, b), dist_seg((px, py), b, c), dist_seg((px, py), c, a))
    return -edge if inside else edge


def generate(size: int) -> bytes:
    canvas = (20, 19, 15)
    orange = (245, 78, 0)
    cream = (247, 247, 244)
    pixels: list[tuple[int, int, int, int]] = []
    aa = 1.25 / size

    for y in range(size):
        for x in range(size):
            u = (x + 0.5) / size - 0.5
            v = (y + 0.5) / size - 0.5

            plate = sd_round_rect(u, v, 0.46, 0.46, 0.16)
            ring = sd_ring(u, v + 0.02, 0.26, 0.045)
            cursor = sd_triangle(u, v, (-0.06, -0.16), (0.16, 0.02), (-0.04, 0.14))

            color = (0, 0, 0)
            alpha = 0.0

            plate_t = max(0.0, min(1.0, 0.5 - plate / aa))
            if plate_t > 0:
                color = canvas
                alpha = plate_t

            ring_t = max(0.0, min(1.0, 0.5 - ring / aa)) * plate_t
            if ring_t > 0:
                color = mix(color, orange, ring_t)
                alpha = max(alpha, ring_t)

            cursor_t = max(0.0, min(1.0, 0.5 - cursor / aa)) * plate_t
            if cursor_t > 0:
                color = mix(color, cream if v > 0.04 and u > 0.0 else orange, cursor_t)
                alpha = max(alpha, cursor_t)

            pixels.append((*color, int(alpha * 255)))

    return png(size, pixels)


def main() -> None:
    out = Path(__file__).resolve().parents[1] / "public"
    for size in (16, 32, 48, 128):
        (out / f"icon-{size}.png").write_bytes(generate(size))
        print(f"wrote icon-{size}.png")


if __name__ == "__main__":
    main()
