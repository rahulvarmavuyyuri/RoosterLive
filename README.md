# Raceway Live

Live RC car racing for your friends, from every corner of the track. Runs entirely on GitHub Pages: phones around the track stream straight to viewers' browsers, and a race control page sends live lap times and chat. No streaming server, no monthly bill.

**Viewers get**

- Live video with engine sound, switching between track cameras (start line, hairpin, pit lane…)
- A live leaderboard: position, laps, best lap and gap, plus a race clock over the video
- Pit wall chat
- The race schedule with a countdown to the next race and winners as races finish
- Driver and car profiles with personal bests and best lap today

## The three pages

| Page | Who opens it | What it does |
|---|---|---|
| `index.html` | Viewers | Watch, follow the leaderboard, chat |
| `camera.html` | One phone per camera position | Streams that position's camera |
| `control.html` | Race director (one device) | Loads races, records laps by tapping, runs chat |

`camera.html` and `control.html` aren't linked from the viewer page and are hidden from search engines.

```
 camera.html (Start line) ──video──┐
 camera.html (Hairpin)    ──video──┼──▶ viewers pick a camera
 camera.html (Pit lane)   ──video──┘
 control.html ── lap times + chat ───▶ all viewers
        (free PeerJS cloud server only introduces browsers to each other)
```

## Race day

1. **Cameras:** on each phone, open `…/camera.html`, choose its position, tap **Go live**. Mount it, plug it into power, keep the screen on. You can preselect a position with `camera.html?cam=hairpin`.
2. **Race control:** on a tablet or laptop at the finish line, open `…/control.html`. It goes online by itself.
3. **Share** `https://<your-username>.github.io/<repo>/` with friends.
4. For each race: choose it, tap **Load race**, then **Start race** when the flag drops.
5. **Tap a driver's card each time their car crosses the line.** The leaderboard updates for everyone instantly. A second tap on the same car within 2 seconds is ignored, and **Undo last lap** removes the most recent tap.
6. A race finishes by itself when every car completes its laps, or tap **End race**. The winner is announced in chat and shown on the schedule.

Race control saves its state in the browser, so refreshing the page mid-race loses nothing.

## How many viewers?

Each camera phone sends a separate copy of its video to every viewer watching that camera, so upload speed sets the limit. Spreading viewers across cameras helps.

| Quality | Upload per viewer | Viewers per camera on 10 Mbps upload |
|---|---|---|
| Standard (480p) | ~0.8 Mbps | ~10 |
| HD (720p) | ~1.5 Mbps | ~5 |
| Full HD (1080p) | ~3 Mbps | ~2–3 |

For bigger audiences, stream one camera to YouTube Live and embed it instead.

## Put it on GitHub Pages

1. In the repo, go to **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then **Save**.
3. After a minute the site is live at `https://<your-username>.github.io/<repo>/`.

GitHub Pages serves over HTTPS, which browsers require for camera access.

## Make it yours

**Settings** — [`js/config.js`](js/config.js):

- `siteName`, `trackName`, `timeZone`
- `streamId` — change to your own long random string. All pages must share it, and anyone who knows it could broadcast under it.
- `cameras` — your camera positions (add or remove entries).
- `iceServers` — add a TURN server if some viewers never get video.

**Drivers** — [`data/racers.json`](data/racers.json): `id`, `name`, `number`, `car`, `class`, `color` (used on the leaderboard and lap buttons), `photo`, `personalBest` in seconds. Put photos in `images/racers/`.

**Schedule** — [`data/schedule.json`](data/schedule.json): `id`, `name`, `class`, `start` (ISO time with offset, e.g. `2026-10-25T10:00:00+05:30`), `laps`, and `racers` (driver ids).

After editing, commit and push; GitHub Pages updates in about a minute. Reload race control after changing the schedule.

## Run it locally

```bash
python3 -m http.server 8000
```

Open http://localhost:8000, http://localhost:8000/camera.html and http://localhost:8000/control.html. Browsers allow the camera on `localhost` without HTTPS.

## Troubleshooting

- **"No cameras are live"** while a camera says it's live — check all pages use the same `config.js` (same `streamId`), then wait up to 8 seconds; viewers re-check automatically.
- **"Another phone is already live as …"** — two phones chose the same position. Pick a different one.
- **"Race control is already open on another device or tab"** — only one race control can run. Close the other one and reload.
- **Chat works but no video** for some viewers — their network blocks peer-to-peer. Add a TURN server to `iceServers`.
- **Video freezes when the phone screen turns off** — keep the camera page open with the screen on.

## Files

```
index.html, camera.html, control.html
css/style.css
js/config.js     settings
js/viewer.js     viewer: camera switching, leaderboard, HUD, chat
js/camera.js     camera capture and streaming
js/control.js    race control: lap taps, race state, chat hub
js/race.js       standings and time formatting (shared)
js/content.js    schedule and driver sections
js/chat-ui.js    chat rendering (shared)
data/            racers.json, schedule.json
images/          driver/car pictures, favicon
```
