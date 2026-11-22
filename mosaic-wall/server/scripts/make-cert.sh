#!/usr/bin/env bash
# Makes certs/key.pem and certs/cert.pem so the iPad can use the camera (Safari needs https for getUserMedia).
# Best: mkcert (brew install mkcert) because the iPad can be told to trust it. Fallback: a self-signed openssl cert.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p certs
IP="${1:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')}"
[ -n "$IP" ] || { echo "Could not find the LAN IP. Run: npm run cert -- 192.168.x.x"; exit 1; }

if command -v mkcert >/dev/null 2>&1; then
  mkcert -install
  mkcert -key-file certs/key.pem -cert-file certs/cert.pem "$IP" localhost 127.0.0.1
  echo
  echo "Now trust it on the iPad (one time):"
  echo "  1. AirDrop this file to the iPad: $(mkcert -CAROOT)/rootCA.pem"
  echo "  2. Settings > General > VPN & Device Management > install the profile"
  echo "  3. Settings > General > About > Certificate Trust Settings > switch it on"
else
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 -keyout certs/key.pem -out certs/cert.pem \
    -subj "/CN=$IP" -addext "subjectAltName=IP:$IP,DNS:localhost,IP:127.0.0.1" 2>/dev/null
  echo "Self-signed cert made (mkcert not found). Safari on the iPad will warn once: tap Show Details > visit this website."
fi
echo "Cert is for https://$IP:${HTTPS_PORT:-3443}/  (re-run if the MacBook's IP changes)"
