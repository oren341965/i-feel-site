#!/usr/bin/env python3
"""Inspect a video file with ffprobe before branding or upload.

Uses only Python's standard library. Set VIDEO_FFPROBE or STUDIO_FFPROBE to
override the ffprobe executable path when it is not available on PATH.
"""
from __future__ import annotations

import glob
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path


def find_ffprobe() -> str:
    for key in ("VIDEO_FFPROBE", "STUDIO_FFPROBE"):
        override = os.environ.get(key)
        if override and Path(override).is_file():
            return override

    found = shutil.which("ffprobe")
    if found:
        return found

    home = Path.home()
    candidates = [home / "VideoStudio" / ".tools" / "bin" / "ffprobe"]
    if platform.system() == "Darwin":
        candidates.extend([Path("/opt/homebrew/bin/ffprobe"), Path("/usr/local/bin/ffprobe")])
    if platform.system() == "Windows":
        local = Path(os.environ.get("LOCALAPPDATA", ""))
        candidates.extend([
            Path(r"C:\VideoStudio\.tools\bin\ffprobe.exe"),
            Path(r"C:\ffmpeg\bin\ffprobe.exe"),
            Path(r"C:\Program Files\ffmpeg\bin\ffprobe.exe"),
            local / "Microsoft" / "WinGet" / "Links" / "ffprobe.exe",
        ])
        candidates.extend(Path(p) / "ffprobe.exe" for p in glob.glob(
            str(local / "Microsoft" / "WinGet" / "Packages" / "Gyan.FFmpeg*" / "*" / "bin")
        ))

    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    raise RuntimeError("ffprobe not found. Install FFmpeg or set VIDEO_FFPROBE to its full path.")


def inspect(path: Path) -> dict:
    executable = find_ffprobe()
    command = [
        executable, "-v", "error", "-show_format", "-show_streams",
        "-print_format", "json", str(path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        detail = result.stderr.strip() or f"ffprobe exited with status {result.returncode}"
        raise RuntimeError(detail)

    info = json.loads(result.stdout)
    streams = info.get("streams", [])
    video = next((stream for stream in streams if stream.get("codec_type") == "video"
                  and not stream.get("disposition", {}).get("attached_pic")), None)
    if not video:
        raise RuntimeError("No video stream detected.")

    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
    raw_duration = info.get("format", {}).get("duration") or video.get("duration")
    try:
        duration = float(raw_duration)
    except (TypeError, ValueError):
        duration = 0.0
    if duration <= 0:
        raise RuntimeError("Could not read a positive video duration.")

    return {
        "file": str(path),
        "duration_seconds": duration,
        "format": info.get("format", {}).get("format_name"),
        "video": {
            "codec": video.get("codec_name"),
            "width": video.get("width"),
            "height": video.get("height"),
        },
        "audio_present": audio is not None,
        "audio_codec": audio.get("codec_name") if audio else None,
    }


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    if len(sys.argv) != 2:
        print("Usage: python video_preflight.py <video-file>", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    if not path.is_file():
        print(f"Input file not found: {path}", file=sys.stderr)
        return 2
    try:
        print(json.dumps(inspect(path), ensure_ascii=False, indent=2))
    except (OSError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"Video preflight failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
