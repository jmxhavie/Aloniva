#!/usr/bin/env python3
"""
Generate responsive JPEG/WEBP variants for images and write a map at data/images.json.

Requirements:
  pip install Pillow

Usage:
  python tools/gen_images.py

It will discover images in assets/freepik and produce variants into assets/optimized/.
"""
from pathlib import Path
from PIL import Image
import json

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / 'assets' / 'freepik'
OUT_DIR = ROOT / 'assets' / 'optimized'
DATA_DIR = ROOT / 'data'
DATA_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

WIDTHS = [768, 1280, 1600]
QUALITY_JPG = 82
QUALITY_WEBP = 80

def process_image(src_path: Path):
    rel_key = str(src_path.relative_to(ROOT)).replace('\\', '/')
    try:
        with Image.open(src_path) as im:
            im = im.convert('RGB')
            width, height = im.size
            aspect = height / width if width else 1
            generated = []
            for w in WIDTHS:
                if w >= width:
                    # Avoid upscaling; still write an entry that points to the original for this width
                    generated.append({'src': f'/{rel_key}', 'width': width})
                    continue
                h = int(round(w * aspect))
                resized = im.resize((w, h), Image.LANCZOS)

                base = src_path.stem
                jpg_name = f"{base}-{w}.jpg"
                webp_name = f"{base}-{w}.webp"
                jpg_path = OUT_DIR / jpg_name
                webp_path = OUT_DIR / webp_name

                resized.save(jpg_path, 'JPEG', quality=QUALITY_JPG, optimize=True, progressive=True)
                resized.save(webp_path, 'WEBP', quality=QUALITY_WEBP, method=6)

                generated.append({'src': f"/assets/optimized/{jpg_name}", 'width': w})
                # Prefer WEBP in modern browsers; keep JPG first for broader compatibility if desired.
            return rel_key, {'sources': generated, 'sizes': '100vw'}
    except Exception as e:
        print(f"Skip {src_path}: {e}")
        return None

def main():
    images = [p for p in SRC_DIR.glob('*.jp*g')]
    result = {}
    for p in images:
        out = process_image(p)
        if out:
            key, data = out
            result['/' + key] = data
            result[key] = data  # allow both with and without leading slash
    (DATA_DIR / 'images.json').write_text(json.dumps(result, indent=2))
    print(f"Wrote map for {len(result)//2} images to data/images.json and variants to {OUT_DIR}")

if __name__ == '__main__':
    main()

