#!/usr/bin/env bash
# Encode the frame sequence and the score into the final 1920x1080 24 fps MP4.
set -euo pipefail
cd "$(dirname "$0")/.."
FRAMES=${1:-out/frames}
OUT=${2:-out/gate_of_the_sun.mp4}
ffmpeg -y -framerate 24 -i "$FRAMES/f%05d.png" -i out/score.wav \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -r 24 -vf "scale=1920:1080:flags=lanczos,format=yuv420p" \
  -c:a aac -b:a 256k -movflags +faststart -shortest "$OUT"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,duration,sample_rate,channels -of default=nw=1 "$OUT"
