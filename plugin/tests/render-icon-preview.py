"""Render an illustrative key sheet for visual QA; this is not an app screenshot."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ITEMS = [
    ("mic", "Mic", "On"), ("camera", "Camera", "On"),
    ("record", "Record", "Ready"), ("speaker", "Speaker", "Off"),
    ("share", "Share", "Ready"), ("hand", "Hand", "Ready"),
    ("transfer", "G1 Transfer", "Ready"), ("activate", "G1 Activate", "Ready"),
    ("zoom", "Zoom +", "Ready"), ("pan-left", "Pan left", "Ready"),
    ("tilt-up", "Tilt up", "Ready"), ("focus", "Focus", "Ready"),
    ("layout", "Layout 2", "Ready"), ("slot", "G1 Slot 2", "Ready"),
    ("overlay", "Overlay", "Ready"), ("hangup", "Hang Up", "Ready")
]
canvas = Image.new("RGB", (720, 760), "#0d1117")
draw = ImageDraw.Draw(canvas)
font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 16)
small = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 12)
draw.text((20, 12), "VDO.Ninja - illustrative command key layout", font=font, fill="white")
for i, (icon, label, state) in enumerate(ITEMS):
    suffix = {"On": "on", "Off": "off", "Ready": "neutral"}[state]
    tile = Image.open(ROOT / f"imgs/command-{icon}-{suffix}.png").convert("RGB")
    text = ImageDraw.Draw(tile)
    text.text((72, 73), label, anchor="mm", font=font, fill="white")
    text.text((72, 94), state, anchor="mm", font=font, fill="white")
    x, y = 20 + i % 4 * 176, 48 + i // 4 * 176
    canvas.paste(tile, (x, y))
    draw.text((x, y + 148), icon, font=small, fill="#9ca3af")
canvas.save(ROOT.parent / "docs/assets/command-icons-preview.png")
