"""Inspect incoming local videos and create bounded-size H.264 web copies.

Usage: python scripts/prepare-videos.py inspect|encode|verify manifest.json
Manifest: [{"source":"absolute/or/relative.mp4", "output":"media/motion/name.mp4"}]
Pillow and imageio-ffmpeg are required. Source files are never modified.
"""

import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import struct

import imageio_ffmpeg
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / ".test-artifacts"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
MAX_BYTES = 24_000_000


def probe(path):
    reader = imageio_ffmpeg.read_frames(str(path), output_params=["-frames:v", "1"])
    try:
        return next(reader)
    finally:
        reader.close()


def inspect(entries):
    sheet = Image.new("RGB", (1280, len(entries) * 215), "#202020")
    labels = ImageDraw.Draw(sheet)
    results = []
    for row, entry in enumerate(entries):
        source = Path(entry["source"]).resolve(strict=True)
        metadata = probe(source)
        with source.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        duration = metadata["duration"]
        result = {"index":row + 1, "source":str(source), "bytes":source.stat().st_size,
                  "sha256":digest, "metadata":metadata}
        results.append(result)
        print(json.dumps(result, ensure_ascii=True), flush=True)
        for column, fraction in enumerate((0.12, 0.35, 0.65, 0.85)):
            second = round(max(0, duration * fraction), 2)
            frame = subprocess.run([
                FFMPEG, "-hide_banner", "-loglevel", "error", "-ss", str(second), "-i", str(source),
                "-frames:v", "1", "-vf", "scale=320:-2", "-f", "image2pipe", "-vcodec", "png",
                "-threads", "1", "-"
            ], capture_output=True, check=True)
            if frame.stdout:
                with Image.open(io.BytesIO(frame.stdout)) as image:
                    image.thumbnail((312, 176))
                    sheet.paste(image, (column * 320 + (320 - image.width) // 2,
                                        row * 215 + (176 - image.height) // 2))
            labels.text((column * 320 + 8, row * 215 + 185),
                        f"Video {row + 1:02d} / {second}s / {duration}s", fill="white")
    ARTIFACTS.mkdir(exist_ok=True)
    sheet.save(ARTIFACTS / "incoming-videos.jpg", quality=92)
    (ARTIFACTS / "incoming-video-info.json").write_text(json.dumps(results, indent=2), encoding="utf-8")


def encode(entries):
    ARTIFACTS.mkdir(exist_ok=True)
    report = []
    for index, entry in enumerate(entries):
        source = Path(entry["source"]).resolve(strict=True)
        target = (ROOT / entry["output"]).resolve()
        if not target.is_relative_to(ROOT / "media" / "motion") or target == source:
            raise ValueError("Output must be a new file under media/motion")
        if target.exists():
            raise FileExistsError(target)
        metadata = probe(source)
        duration = metadata["duration"]
        if duration <= 0:
            raise ValueError("Cannot determine duration: " + str(source))
        target.parent.mkdir(parents=True, exist_ok=True)
        # Match the existing 720p previews and enable native streaming playback.
        filters = "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1"
        if metadata["fps"] > 30:
            filters += ",fps=30"
        audio_kbps = 128
        video_kbps = min(1800, int(MAX_BYTES * 0.92 * 8 / duration / 1000) - audio_kbps)
        if video_kbps < 350:
            raise ValueError("Video is too long for the current upload limit")
        log = ARTIFACTS / f"encode-{index}"
        common = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
                  "-map", "0:v:0", "-vf", filters, "-c:v", "libx264", "-preset", "medium",
                  "-b:v", f"{video_kbps}k", "-pix_fmt", "yuv420p", "-threads", "4", "-passlogfile", str(log)]
        print(json.dumps({"encoding":entry["output"], "duration":duration, "videoKbps":video_kbps}), flush=True)
        subprocess.run(common + ["-pass", "1", "-an", "-f", "null", "-"], check=True)
        subprocess.run(common + ["-pass", "2", "-map", "0:a:0?", "-c:a", "aac", "-b:a", f"{audio_kbps}k",
                                 "-map_metadata", "-1", "-movflags", "+faststart", str(target)], check=True)
        output = probe(target)
        if target.stat().st_size > MAX_BYTES:
            raise ValueError("Encoded video exceeds upload limit: " + str(target))
        if abs(output["duration"] - duration) > 0.3:
            raise ValueError("Encoded duration mismatch: " + str(target))
        result = {"output":entry["output"], "sourceBytes":source.stat().st_size,
                  "bytes":target.stat().st_size, "duration":output["duration"],
                  "size":output["size"], "fps":output["fps"], "codec":output["codec"]}
        report.append(result)
        (ARTIFACTS / "video-encoding-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(result), flush=True)


def verify(entries):
    for entry in entries:
        target = (ROOT / entry["output"]).resolve(strict=True)
        if not target.is_relative_to(ROOT / "media" / "motion"):
            raise ValueError("Only verify files under media/motion")
        metadata = probe(target)
        assert target.stat().st_size < MAX_BYTES, target
        assert metadata["codec"] == "h264", target
        assert metadata["size"][0] <= 1280 and metadata["size"][1] <= 720, target
        assert metadata["fps"] <= 30.01, target
        assert metadata.get("audio_codec") == "aac", target
        atoms = {}
        with target.open("rb") as stream:
            while stream.tell() < target.stat().st_size:
                offset = stream.tell()
                size, kind = struct.unpack(">I4s", stream.read(8))
                if size == 1:
                    size = struct.unpack(">Q", stream.read(8))[0]
                elif size == 0:
                    size = target.stat().st_size - offset
                if size < 8:
                    raise ValueError("Invalid MP4 atom")
                atoms[kind] = offset
                stream.seek(offset + size)
        assert atoms[b"moov"] < atoms[b"mdat"], "Missing faststart: " + str(target)
        subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-xerror", "-threads", "4",
                        "-i", str(target), "-map", "0:v:0", "-map", "0:a:0?", "-f", "null", "-"], check=True)
        print(json.dumps({"verified":entry["output"], "fullDecode":True, "faststart":True}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("inspect", "encode", "verify"))
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    entries = json.loads(args.manifest.read_text(encoding="utf-8"))
    {"inspect":inspect, "encode":encode, "verify":verify}[args.mode](entries)


if __name__ == "__main__":
    main()
