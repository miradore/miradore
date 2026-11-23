# Miradore Crowd Screens

Turns the audience's phones into one synchronised light show. People scan a QR code, a web page opens, and the operator controls every screen from a tablet. Nothing is installed.

## How it works

- **Audience page (`/`)**: full-screen page that syncs to the server clock, keeps the screen awake and shows whatever look is live. Before the show it displays a standby screen. If the connection drops, the current look keeps running and the phone reconnects and catches up by itself.
- **Operator pad (`/pad?key=...`)**: sends looks to everyone or to chosen zones. A strip of sample phones at the top shows what each zone is displaying, drawn by the same code the phones run. A red banner appears if the pad loses its connection.
- **Show server (`server.js`)**: one small Node process. Every cue is stamped to fire 500 ms in the future, so phones change together even when their connections have different delays. The live look is saved to disk and restored if the server restarts.

### Looks

| Look | What the crowd sees |
|---|---|
| Colour | One solid colour, snapped or faded in over 1 or 2 seconds |
| Rainbow wave, Miradore cycle | Colours rolling across the zones in order |
| Beat pulse, Two-colour beat | Flashes or colour swaps on the tapped tempo |
| Breathe | Slow swell of one colour |
| Sparkle | Random phones twinkling |
| Two-colour split, Miradore split | Each phone holds one colour, so the crowd becomes a mix |
| Zone chase | Light sweeping from zone to zone |
| Fire, Ocean, Lighters | Each phone drifts through a palette on its own |
| Flash | One hit of white or colour over the current look |
| Text, Countdown | Big words, or a countdown ending on a word |
| Standby screen, Blackout | Back to the waiting screen, or black |

Flashing is held to about 3 times a second (photosensitivity limit), and the server enforces it however fast the pad is tapped: tempo is capped at 180 BPM, look changes in a zone are spaced at least a third of a second apart with the last tap winning, the flash button is thinned out or disabled while a fast beat effect is running, and brightness changes are smoothed.

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
| `SHOW_NAME` | none | Show title on the join screen, e.g. `ROX` |
| `QUICK_TEXTS` | four defaults | Comma-separated one-tap text buttons on the pad |
| `LEAD_MS` | `500` | How far ahead cues are scheduled |
| `STATE_FILE` | temp folder | Where the live look is saved across restarts |
| `MAX_CLIENTS` | `20000` | Connection limit |

## Hosting

Any host that runs Node 18+ (or the included `Dockerfile`) and supports WebSockets works. It must be served over HTTPS: the screen wake lock only works on secure pages. Run a single instance (state is in memory), and raise the open-file limit above the expected crowd size.

## Tests

```bash
npm test                                   # look engine and server protocol
node test/manual/e2e.js                    # emulated phones and pad in a real browser (needs Playwright and a running server)
node loadtest.js wss://show.example.com/ws 5000 <operator-key> 10
```

The load test simulates the phones and an operator and reports delivery times. Run it against the real hosting before the show, from a different machine than the server.

## Before each show

- Use a long random `OPERATOR_KEY`, and share the pad link only with the operator.
- Press **Standby screen** before doors open. The last look from a rehearsal is otherwise shown to the first people who join.
- Two pads can be open at once. The preview strip is always true on both; the highlighted pad button is local to each tablet.

## Known limits

- A web page cannot set screen brightness or use the torch; the join screen asks people to turn brightness up.
- iPhone Safari keeps its address bar; Android goes full-screen.
- Screen wake lock needs iOS 16.4 or later; older iPhones dim after their auto-lock time.
- Pictures and videos are not supported in this version.
