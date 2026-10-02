#!/usr/bin/env python3
"""Generates Waraq's PWA icons with Pillow only (no ImageMagick/Chromium
needed in this environment). Draws a simple folded-document glyph with three
text lines — legible at 192px, and with enough padding at 512px to also
serve as the maskable icon (Android/ChromeOS crop to a center circle)."""
import os

from PIL import Image, ImageDraw

ACCENT = (37, 99, 235, 255)  # #2563eb, matches --accent in styles.css
WHITE = (255, 255, 255, 255)
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "app", "icons")


def draw_document(draw, cx, cy, scale, page_color, fold_color, line_color):
    w, h = 44 * scale, 56 * scale
    fold = 14 * scale
    x0, y0 = cx - w / 2, cy - h / 2
    x1, y1 = cx + w / 2, cy + h / 2

    page = [(x0, y0), (x1 - fold, y0), (x1, y0 + fold), (x1, y1), (x0, y1)]
    draw.polygon(page, fill=page_color)
    draw.polygon([(x1 - fold, y0), (x1, y0 + fold), (x1 - fold, y0 + fold)], fill=fold_color)

    # Three text lines, shortening like a trailing paragraph. Centered, so
    # the glyph does not imply a reading direction.
    line_h = 6 * scale
    gap = 9 * scale
    start_y = y0 + 16 * scale
    for i, width_frac in enumerate((0.62, 0.62, 0.40)):
        lw = (w - 14 * scale) * width_frac
        lx0 = cx - lw / 2
        ly0 = start_y + i * gap
        draw.rounded_rectangle([lx0, ly0, lx0 + lw, ly0 + line_h], radius=line_h / 2, fill=line_color)


def make(size, maskable=False, out_name=None):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2

    if maskable:
        # Fill the full square — the OS may crop to a circle/squircle — and
        # keep the glyph inside the ~72% safe zone, inverted (white page on
        # an accent background, so it still reads clearly after cropping).
        draw.rectangle([0, 0, size, size], fill=ACCENT)
        draw_document(draw, cx, cy, size / 128 * 0.78, WHITE, ACCENT, ACCENT)
    else:
        draw_document(draw, cx, cy, size / 128, ACCENT, WHITE, WHITE)

    name = out_name or f"icon-{size}.png"
    img.save(os.path.join(OUT_DIR, name))
    print("wrote", name)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    make(192)
    make(512)
    make(512, maskable=True, out_name="maskable-512.png")
    make(32, out_name="favicon-32.png")


if __name__ == "__main__":
    main()
