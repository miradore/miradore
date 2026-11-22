# AI video mosaic wall: office test build

Guest takes a photo on the iPad, Higgsfield turns it into a 5 second clip, the operator approves it, and it lands as a tile on the wall. On cue the tiles rearrange into the Miradore Labs logo.

This folder is the build for test plan v2 (Show Tech, 23 Nov 2026). Rule from the plan: do not start a step until the previous check passes.

| Plan step | Owner | What is here | Status |
|---|---|---|---|
| 0 Prep | Shayan | Checklist below | To do on site |
| 1 Look test | Haider | `docs/step1-look-test.csv` score sheet, prompts in `server/themes.json` | To do by hand; Teepu approves |
| 2 Capture page | Haider | `server/public/` | Built, tested in a desktop browser. iPad check still to run |
| 3 Generation server | Haider | `server/` | Built, tested end to end with the mock generator. Real API not yet called |
| 4 Wall | Talha, Shayan | `touchdesigner/` | Built, logic tested in simulation. Not yet opened in TouchDesigner |
| 4b Atlas | Talha | `server/scripts/bake-atlas.js` + Atlas Mode | Built, only use if fps drops below 50 |
| 5 Reveal | Talha | `touchdesigner/mosaic_assign.py`, Reveal pulse | Built, maths tested |
| 6 Full run | Team | `npm run passmarks` | To do |
| 7 Event spec | Show Tech | `docs/event-spec.md` | Draft with [FILL] fields |

## The look: Tessera

The wall is treated as a real mosaic: glazed square tiles with grout gaps on a lapis ground, and gold leaf for the one tile that has just arrived. The iPad, the phone page and the operator page share the same palette and type (`server/public/tessera.css`). Syne and Manrope are bundled in `server/public/fonts/` (both under the SIL Open Font License), so the booth needs no internet for its fonts.

- Open `touchdesigner/wall-look.html` in a browser for a working preview of the wall's look and motion, with the timings the TouchDesigner build uses. Talha should match the wall to it.
- World colours on the theme picker come from `server/themes.json`.

## Step 0. Prep (Shayan)

- MacBook to the office screen by HDMI, extended display, native resolution, no overscan.
- Wired internet in. Speedtest upload above 20 Mbps.
- iPad on a stand with a soft front light.
- Install TouchDesigner, ffmpeg (`brew install ffmpeg`), mkcert (`brew install mkcert`) and **Node.js 22.13 or newer** (the plan said 20+, but the server uses Node's built-in SQLite so there is nothing native to compile).
- Write down: screen size [FILL], resolution [FILL], MacBook chip [FILL], RAM [FILL].

## Steps 2 and 3. Server

```bash
cd mosaic-wall/server
npm install
cp .env.example .env        # then put the Higgsfield key in HF_CREDENTIALS (KEY_ID:KEY_SECRET)
npm run cert                # one time: HTTPS certificate so the iPad camera works
npm start
```

It prints three addresses:

- **iPad capture**: `https://<MacBook IP>:3443/?k=<booth token>`. Use the full address the server prints. HTTPS is required: Safari will not open the camera on plain http, and `npm run cert` prints how to trust the certificate on the iPad. The `?k=` token is what lets the iPad submit photos; guests' phones on the same network do not have it, so they cannot spend credits.
- **Operator**: `http://localhost:3000/operator`, on the MacBook only. `A` approves, `R` rejects, arrow keys move.
- **Guest clip links** (the QR code): `http://<MacBook IP>:3000/clip/<jobId>`. A guest only sees their clip after it is approved.

Two settings in `.env` matter for guests' phones:

- `PUBLIC_BASE_URL`: the address in the QR code. If the MacBook is on wired internet and wifi at once, set this to the address phones can reach (the server warns when it sees more than one). A phone on mobile data cannot open a local address at all.
- `WIFI_NAME`: shown on the thank-you screen so guests join the right network before scanning.

To rehearse with no API calls and no credits, set `GEN_PROVIDER=mock` in `.env`. It makes a slow push-in on the photo instead of an AI clip.

Folders the server makes: `uploads/` photos, `clips/` raw clips, `tiles/` 320x320 HAP tiles for the wall, `hero/` full clips, `data/` database and colour data, `jobs.csv` one row per job.

### Step 2 check (iPad)

1. On the iPad open the capture address (with `?k=`) in Safari, Share, Add to Home Screen, open it from there (full screen), then turn on Guided Access. In Settings > Accessibility > Guided Access set Display Auto-Lock to Never, so the camera is not cut off.
2. Submit 5 photos in a row. Each JPEG appears in `server/uploads/` named with its job id.
3. Leave the thank-you screen alone: it returns to the start after 20 seconds. Any other screen returns after 90 seconds untouched.

### Step 3 check

```bash
npm run test-jobs -- 10 ~/Desktop/staff1.jpg ~/Desktop/staff2.jpg   # 10 jobs, cycling the photos and themes
```

Approve them on the operator page, then:

- `jobs.csv` shows `seconds_taken` per clip (submit to clip ready, queue wait included) and `attempts` (2 means the one retry was used).
- `grep -rn "HF_CREDENTIALS" --include=*.js --include=*.json . | grep -v node_modules` shows only variable names, never the key. `.env` is git-ignored.
- Scan a QR code with a phone on office wifi: the clip plays and downloads.

### About the Higgsfield API

docs.higgsfield.ai could not be opened from where this was built, so the endpoints were taken from Higgsfield's official Node SDK (`@higgsfield/client` 0.2.6) instead of guessed. They are listed at the top of `server/src/higgsfield.js`. Three things to confirm on the first real run:

1. **Photo upload.** The SDK's `uploadImage` is used to get a URL for the guest photo. It sends the key in an older header style than the rest of the API, so it is the call most likely to be refused. If it is, every job fails at once with an authentication error; the fix is in `start()` in `higgsfield.js`. Make one real call before anything else.
2. **Model.** `models.json` ships the three DoP models, the only image-to-video endpoint the SDK documents. To use Seedance or Kling, add an entry with the endpoint and body copied from the docs, then set `GEN_MODEL` in `.env`. That is also how to switch model on the day if one is slow.
3. **Clip length and size.** The DoP request has no duration field in the SDK. Check what comes back in Step 1.

Failures: each job gets one retry. A dropped connection while waiting does not count as a failure and never resubmits the clip, so a wifi blip cannot bill a clip twice. Moderation rejections, a bad key and no credits fail straight away because a retry cannot help. On the operator page a failed job can be tried again or turned into a still-photo tile (the plan's last resort).

### Other commands

| Command | What it does |
|---|---|
| `npm run passmarks` | Step 6 numbers from `jobs.csv`: median and worst time, busiest hour, failure rate |
| `npm run test-tiles -- 100` | Step 4: copies the real tiles up to 100. `npm run test-tiles -- --clean` removes the copies |
| `npm run bake-atlas -- --cols 10 --rows 10 --watch` | Step 4b only |
| `npm run purge` | Deletes jobs older than `RETENTION_DAYS` (7). `-- --dry-run` lists, `-- --all` clears everything |

## Steps 4 and 5. Wall

See `touchdesigner/README.md`.

## Step 6. Full run and soak

1. 30 staff through the iPad in an hour, operator approving, wall live.
2. `npm run passmarks -- --since 2026-11-23T14:00` (the start time of the run) prints pass or fail for time to clip, throughput and failure rate.
3. Ask 10 guests "does it look like you?". Pass is 8 of 10.
4. Leave the wall running 2 hours. `server/data/perf_log.csv` gets a line every 10 seconds with fps and memory. Pass is no crash, fps steady, memory not climbing.
5. Anything that failed goes in a written list with its fix.

## Data and consent

- The consent line on the iPad is the plan's wording, including "deleted after 7 days". If Teepu changes the retention period, change `RETENTION_DAYS` in `.env` **and** the sentence in `server/public/index.html`.
- `npm run purge` deletes local copies. Photos sent to Higgsfield sit under Higgsfield's own retention and training terms: confirm those before a public event.
- Nothing reaches the wall or a guest's phone without operator approval.
