"""Verify generated assets and produce a local video-poster contact sheet."""

import json
import io
from pathlib import Path
import subprocess
import sys

from PIL import Image, ImageDraw, ImageStat

ROOT = Path(__file__).resolve().parents[1]


def main():
    source = (ROOT / "assets" / "media-info.js").read_text(encoding="utf-8")
    metadata = json.loads(source.split("window.PORTFOLIO_MEDIA=", 1)[1].strip().removesuffix(";"))
    thumbs = list((ROOT / "_thumbs").rglob("*.webp"))
    for path in thumbs:
        with Image.open(path) as image:
            assert image.width <= 360 and image.height <= 220, path
            image.verify()
    posters = [(src, entry) for src, entry in metadata.items() if "poster" in entry]
    if "--samples" in sys.argv:
        from imageio_ffmpeg import get_ffmpeg_exe
        targets = posters
        samples = Image.new("RGB", (1280, 220 * len(targets)), "#202020")
        labels = ImageDraw.Draw(samples)
        for row, (src, entry) in enumerate(targets):
            for column, second in enumerate((3, 5, 7, 9)):
                result = subprocess.run([get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-ss", str(second),
                                         "-i", str(ROOT / src), "-frames:v", "1", "-vf", "scale=320:-2",
                                         "-f", "image2pipe", "-vcodec", "png", "-threads", "1", "-"],
                                        capture_output=True, check=True)
                if result.stdout:
                    with Image.open(io.BytesIO(result.stdout)) as image:
                        image.thumbnail((312, 180))
                        samples.paste(image, (column * 320, row * 220))
                labels.text((column * 320, row * 220 + 190), f"{Path(entry['poster']).stem} / {second}s", fill="white")
        output = ROOT / ".test-artifacts"
        output.mkdir(exist_ok=True)
        samples.save(output / "poster-samples.jpg", quality=90)
        print(output / "poster-samples.jpg")
        return
    sheet = Image.new("RGB", (960, 210 * ((len(posters) + 2) // 3)), "#202020")
    draw = ImageDraw.Draw(sheet)
    for index, (src, entry) in enumerate(posters):
        with Image.open(ROOT / entry["poster"]) as image:
            assert image.size == (entry["width"], entry["height"]), src
            assert max(ImageStat.Stat(image.convert("RGB")).stddev) > 5, src
            image.thumbnail((312, 176))
            x, y = (index % 3) * 320, (index // 3) * 210
            sheet.paste(image, (x + (320 - image.width) // 2, y + (176 - image.height) // 2))
            draw.text((x + 8, y + 185), f"{index + 1:02d}  {Path(entry['poster']).stem}", fill="white")
    output = ROOT / ".test-artifacts"
    output.mkdir(exist_ok=True)
    sheet.save(output / "video-posters.jpg", quality=90)
    print(json.dumps({"thumbnails":len(thumbs), "posters":len(posters),
                      "posterBytes":sum((ROOT / entry["poster"]).stat().st_size for _, entry in posters),
                      "contactSheet":str(output / "video-posters.jpg")}))


if __name__ == "__main__":
    main()
