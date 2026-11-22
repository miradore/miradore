# AI video mosaic wall: event spec (Step 7)

Draft. Only valid after Step 6 passes. Every [FILL] needs a measured number from the office test or a decision from Teepu or Finance.

## Wall

| Item | Spec |
|---|---|
| LED pitch | 2.6 to 3.9 mm. Rule of thumb: closest comfortable viewing distance in metres is about the pitch in mm, so 2.6 mm for guests within 3 m, 3.9 mm if the nearest guest is 4 m back |
| Size | [FILL] m wide x [FILL] m high, from venue and guest count |
| Grid | [FILL] columns x [FILL] rows. Size the grid to the guest count: about one cell per expected guest, so the wall is nearly full by the end. Tiles should be at least 25 cm on the wall to read as faces |
| Processor input | Native panel resolution [FILL], 60 Hz, from the playback PC |
| Reveal image | [FILL], same shape as the grid |

## Playback and generation

| Item | Spec |
|---|---|
| Main playback | RTX 4090 PC running TouchDesigner and the server |
| Backup | MacBook with the same project and a synced copy of `server/tiles` and `server/hero`, on a second input of the LED processor |
| Booths | 2 iPads for 300+ guests, each on a stand with a soft front light, Guided Access on |
| Network | Wired venue line plus bonded 4G/5G backup. Never venue wifi. iPads and the playback PC on our own router |
| Upload needed | [FILL] Mbps measured at the venue (office test passed at 20+) |

## Throughput

Measured in Step 6: median photo to clip [FILL] s, worst [FILL] s, per booth [FILL] guests per hour.

Generation slots needed = guests per hour x median seconds / 3600, plus one spare. Example: 2 booths at 60 per hour each and a 120 s median needs 4, so set `MAX_CONCURRENCY=5`. Confirm Higgsfield's concurrency limit on our plan: [FILL].

## Crew

| Role | Count |
|---|---|
| TouchDesigner operator | 1 |
| AI operator (approves clips, watches the queue) | 1 |
| Booth hosts | 1 to 2 per booth |

## Cost for Finance

| Item | Amount |
|---|---|
| Higgsfield cost per clip (credits and PKR) | [FILL] from the Step 3 run |
| Expected clips (guests x 1.15 for retakes and retries) | [FILL] |
| LED wall hire | [FILL] |
| Playback PC, iPads, stands, lights, router, bonded 4G/5G | [FILL] |
| Crew day rates | [FILL] |

## Fallbacks on the day

- AI slow or down: change `GEN_MODEL` in `.env` and restart the server (queued jobs carry on). Last resort: "Use still photo" on the operator page.
- Queue at peak: the thank-you screen already tells guests the clip arrives on their phone; the wall fills as clips land.
- Unsafe or odd output: nothing reaches the wall without approval.
- Playback PC fails: switch the LED processor to the MacBook input.

## Open items for Teepu

Screen size and resolution; which MacBook; the 3 approved themes; the reveal image; pass marks; retention period (the iPad consent line says 7 days).
