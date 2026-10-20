"""Create a local decoder regression clip from the existing authorized test frames."""
from pathlib import Path
import shutil
import subprocess

out = Path(__file__).resolve().parents[1] / "android/recorder/build/reports"
frames = [
    "duolingo-promotion-start.png",
    "duolingo-promotion-live-03.png",
    "duolingo-promotion-live-05.png",
    "duolingo-promotion-start.png",  # Exercise rejects the four-ply attempt.
    "duolingo-promotion-live-03.png",
    "duolingo-promotion-live-05.png",
    "duolingo-promotion-live-07.png",
]
assert all((out / name).is_file() for name in frames), "Install the documented vision fixtures first"
ffmpeg = shutil.which("ffmpeg")
assert ffmpeg, "FFmpeg is required only to generate this test clip"
lines = []
for name in frames:
    lines += [f"file '{(out / name).as_posix()}'", "duration 1.4"]
lines += [f"file '{(out / frames[-1]).as_posix()}'"]
manifest = out / "v121-video-frames.txt"
manifest.write_text("\n".join(lines), encoding="utf-8")
subprocess.run(
    [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat",
     "-safe", "0", "-i", str(manifest), "-vf",
     "pad=1320:2400:120:0:black,scale=660:1200", "-r", "10",
     "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p",
     str(out / "v121-practice-rewind.mp4")],
    check=True,
)
