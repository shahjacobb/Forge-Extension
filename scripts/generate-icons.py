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


def sd_ring(x: float, y: float, r: float, w: float) -> float:
    return abs(math.hypot(x, y) - r) - w


def generate(size: int) -> bytes:
    plate_color = (88, 86, 79)
    ring_color = (201, 195, 180)
    hand_color = (212, 209, 200)
    pixels: list[tuple[int, int, int, int]] = []
    aa = 1.25 / size

    for y in range(size):
        for x in range(size):
            u = (x + 0.5) / size - 0.5
            v = (y + 0.5) / size - 0.5

            plate = sd_round_rect(u, v, 0.46, 0.46, 0.16)
            ring = sd_ring(u, v + 0.015, 0.27, 0.042)
            hand = abs(u) - 0.028
            hand = max(hand, v + 0.015 - 0.01)
            hand = max(hand, -0.22 - v)
            tick = max(abs(u) - 0.03, abs(v + 0.31) - 0.045)

            color = (0, 0, 0)
            alpha = 0.0

            plate_t = max(0.0, min(1.0, 0.5 - plate / aa))
            if plate_t > 0:
                color = plate_color
                alpha = plate_t

            ring_t = max(0.0, min(1.0, 0.5 - ring / aa)) * plate_t
            if ring_t > 0:
                color = mix(color, ring_color, ring_t)
                alpha = max(alpha, ring_t)

            hand_t = max(0.0, min(1.0, 0.5 - hand / aa)) * plate_t
            if hand_t > 0:
                color = mix(color, hand_color, hand_t)
                alpha = max(alpha, hand_t)

            tick_t = max(0.0, min(1.0, 0.5 - tick / aa)) * plate_t
            if tick_t > 0:
                color = mix(color, ring_color, tick_t)
                alpha = max(alpha, tick_t)

            pixels.append((*color, int(alpha * 255)))

    return png(size, pixels)


def main() -> None:
    out = Path(__file__).resolve().parents[1] / "public"
    for size in (16, 32, 48, 128):
        (out / f"icon-{size}.png").write_bytes(generate(size))
        print(f"wrote icon-{size}.png")


if __name__ == "__main__":
    main()
