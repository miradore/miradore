#!/usr/bin/env bash
# Two-pass delivery encode capped under GitHub's 100 MB file limit (~9.2 Mb/s total).
set -euo pipefail
cd "$(dirname "$0")/.."
FRAMES=${1:-out/frames}
OUT=${2:-out/gate_of_the_sun_delivery.mp4}
P=out/x264pass
COMMON=(-framerate 24 -i "$FRAMES/f%05d.png")
VF="scale=1920:1080:flags=lanczos,format=yuv420p"
ffmpeg -y "${COMMON[@]}" -c:v libx264 -preset slow -tune grain -b:v 8800k -pass 1 -passlogfile "$P" -vf "$VF" -an -f mp4 /dev/null
ffmpeg -y "${COMMON[@]}" -i out/score.wav -c:v libx264 -preset slow -tune grain -b:v 8800k -maxrate 14M -bufsize 20M \
  -pass 2 -passlogfile "$P" -vf "$VF" -r 24 -c:a aac -b:a 256k -movflags +faststart -shortest "$OUT"
rm -f "$P"*
ls -la "$OUT"
