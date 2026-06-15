import os, math
from PIL import Image, ImageDraw

BASE = "icons"
os.makedirs(BASE, exist_ok=True)

PURPLE = (0x53, 0x4A, 0xB7, 255)
WHITE = (255, 255, 255, 255)
# White at 25% opacity composited over PURPLE
TRACK = tuple(round(0.25 * 255 + 0.75 * ch) for ch in PURPLE[:3]) + (255,)

SCALE = 8  # supersample factor for smooth edges


def make_icon(size):
    big = size * SCALE
    c = big / 2
    cy = big * 0.56
    r = big * 0.34
    sw = big * 0.075
    nl = big * 0.28
    hr = big * 0.07
    rx = big * 0.18
    pct = 0.30  # needle resting at 30% for the icon

    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    draw.rounded_rectangle([0, 0, big - 1, big - 1], radius=rx, fill=PURPLE)

    bbox = [c - r, cy - r, c + r, cy + r]

    def point(angle_deg, radius):
        a = math.radians(angle_deg)
        return (c + radius * math.cos(a), cy + radius * math.sin(a))

    def cap(angle_deg, width, color):
        x, y = point(angle_deg, r)
        rad = width / 2
        draw.ellipse([x - rad, y - rad, x + rad, y + rad], fill=color)

    # Track arc (full 300° sweep)
    draw.arc(bbox, 210, 510, fill=TRACK, width=int(sw))
    cap(210, sw, TRACK)
    cap(510, sw, TRACK)

    # Fill arc (0% .. pct)
    sweep = pct * 300
    if sweep > 0:
        end_angle = 210 + sweep
        draw.arc(bbox, 210, end_angle, fill=WHITE, width=int(sw))
        cap(210, sw, WHITE)
        cap(end_angle, sw, WHITE)

        # Needle
        na = 210 + sweep
        nx, ny = point(na, nl)
        needle_w = sw * 0.75
        draw.line([(c, cy), (nx, ny)], fill=WHITE, width=int(needle_w))
        rad = needle_w / 2
        draw.ellipse([nx - rad, ny - rad, nx + rad, ny + rad], fill=WHITE)

    # Hub
    draw.ellipse([c - hr, cy - hr, c + hr, cy + hr], fill=WHITE)

    img = img.resize((size, size), Image.LANCZOS)
    img.save(f"{BASE}/icon{size}.png")
    print(f"icons/icon{size}.png done")


for size in [16, 32, 48, 128]:
    make_icon(size)

print("Done.")
