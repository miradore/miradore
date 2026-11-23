# Miradore Crowd Screens

Turns the audience's phones into one synchronised light show. People scan a QR code, a web page opens, and the operator controls every screen from a tablet. Nothing is installed.

## How it works

- **Audience page (`/`)**: full-screen page that syncs to the server clock, keeps the screen awake and shows whatever look is live. If the connection drops, the current look keeps running and the phone reconnects by itself.
- **Operator pad (`/pad?key=...`)**: colours, fades, effects, tap tempo, text and countdown, sent to everyone or to chosen zones. Shows the live phone count and the QR codes.
- **Show server (`server.js`)**: one small Node process. Every cue is stamped to fire 500 ms in the future, so phones change together even when their connections have different delays.

Looks: solid colour (snap or fade), rainbow wave, beat pulse, sparkle, zone chase, Miradore colour cycle, text, countdown, blackout. Beat pulse is capped at 180 BPM (3 flashes per second) for photosensitivity.

## Run it

```bash
npm install
OPERATOR_KEY=choose-a-secret ZONES="Left,Right,Pit" npm start
```

Open `http://localhost:8080/pad?key=choose-a-secret` for the pad and `http://localhost:8080/` on a phone.

| Setting | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `OPERATOR_KEY` | random, printed at start | Secret for the operator pad |
| `ZONES` | `Main` | Comma-separated zone names, in the order waves travel |
| `PUBLIC_URL` | from the request | Address printed into the QR codes, e.g. `https://show.miradore.ae` |
| `LEAD_MS` | `500` | How far ahead cues are scheduled |
| `MAX_CLIENTS` | `20000` | Connection limit |

## Hosting

Any host that runs Node 18+ and supports WebSockets works. It must be served over HTTPS: the screen wake lock only works on secure pages. Run a single instance (state is in memory), and raise the open-file limit above the expected crowd size.

## Load test

```bash
node loadtest.js wss://show.example.com/ws 5000 <operator-key> 10
```

Simulates the phones and an operator and reports delivery times. Run it against the real hosting before the show, from a different machine than the server.

## Known limits

- A web page cannot set screen brightness or use the torch; the join screen asks people to turn brightness up.
- iPhone Safari keeps its address bar; Android goes full-screen.
- Screen wake lock needs iOS 16.4 or later; older iPhones dim after their auto-lock time.
- Pictures and videos are not supported in this version.
