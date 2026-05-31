#!/usr/bin/env python3
"""Transparent gradient N mark for splash/auth + iOS launch images."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(
    "/Users/samynaoum/.cursor/projects/Users-samynaoum-Desktop-musician-ai-studio/assets/"
    "DE209EA3-AF4A-4EC8-BC0E-B60E01A1B28D-7e66ea46-bf1b-44b4-b5e6-5bdfe0fabc3a.png"
)
BG = (5, 7, 13)


def alpha_from_black(r: int, g: int, b: int) -> int:
    lum = r + g + b
    if lum <= 22:
        return 0
    if lum >= 58:
        return 255
    return min(255, int((lum - 22) * 7.5))


def knock_out_black(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            a = alpha_from_black(r, g, b)
            if a < 255:
                px[x, y] = (r, g, b, a)
    return im


def trim_transparent(im: Image.Image, pad: int = 8) -> Image.Image:
    px = im.load()
    w, h = im.size
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 12:
                minx = min(minx, x)
                miny = min(miny, y)
                maxx = max(maxx, x)
                maxy = max(maxy, y)
    if maxx <= minx:
        return im
    return im.crop((max(0, minx - pad), max(0, miny - pad), min(w, maxx + pad + 1), min(h, maxy + pad + 1)))


def fit_mark(im: Image.Image, max_side: int) -> Image.Image:
    w, h = im.size
    scale = max_side / max(w, h)
    if scale >= 1:
        return im
    nw = max(1, int(w * scale))
    nh = max(1, int(h * scale))
    return im.resize((nw, nh), Image.Resampling.LANCZOS)


def make_splash_background(size: int) -> Image.Image:
    im = Image.new("RGB", (size, size), BG)
    px = im.load()
    for y in range(size):
        for x in range(size):
            cx = (x - size * 0.5) / size
            cy = (y - size * 0.5) / size
            d = cx * cx + cy * cy
            glow = max(0.0, 1.0 - d * 2.8)
            r = min(255, BG[0] + int(28 * glow) + int(18 * max(0, -cx)))
            g = min(255, BG[1] + int(12 * glow) + int(8 * max(0, -cy)))
            b = min(255, BG[2] + int(42 * glow) + int(22 * max(0, cx)))
            px[x, y] = (r, g, b)
    return im


def compose_ios_splash(mark: Image.Image, size: int = 2732) -> Image.Image:
    bg = make_splash_background(size)
    target = int(size * 0.34)
    logo = fit_mark(mark.copy(), target)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - logo.width) // 2
    oy = int(size * 0.38) - logo.height // 2
    layer.paste(logo, (ox, oy), logo)
    out = bg.convert("RGBA")
    out.alpha_composite(layer)
    return out.convert("RGB")


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC
    mark = knock_out_black(Image.open(src))
    mark = trim_transparent(mark)
    mark = fit_mark(mark, 900)
    mark_path = ROOT / "assets/icons/splash-mark.png"
    mark.save(mark_path, "PNG", optimize=True)
    print("wrote", mark_path, mark.size)

    ios = compose_ios_splash(mark)
    for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
        p = ROOT / "ios/App/App/Assets.xcassets/Splash.imageset" / name
        ios.save(p, "PNG", optimize=True)
        print("wrote", p)


if __name__ == "__main__":
    main()
