# RoosterLive

A live rooster cam website that runs entirely on GitHub Pages. A phone or laptop at the coop broadcasts its camera straight to viewers' browsers — no streaming server, no monthly bill.

**What viewers get**

- The live video with sound, a viewer count and full-screen mode
- Coop chat with everyone watching
- A "next big crow" countdown with sunrise and sunset for the coop's location
- Meet the flock profiles
- A photo gallery

## How it works

```
 Phone at the coop (broadcast.html)
        │  camera + mic
        ├────────── video ──────────▶ viewer 1 (index.html)
        ├────────── video ──────────▶ viewer 2
        └── chat relay ◀──────────▶  everyone
                │
     free PeerJS cloud server (only introduces browsers to each other)
```

The video goes peer-to-peer over WebRTC using [PeerJS](https://peerjs.com). The broadcaster sends one copy of the video to each viewer, so the number of viewers is limited by the broadcasting device's upload speed:

| Quality | Upload per viewer | Comfortable viewers on 10 Mbps upload |
|---|---|---|
| Standard (480p) | ~0.8 Mbps | ~10 |
| HD (720p) | ~1.5 Mbps | ~5 |
| Full HD (1080p) | ~3 Mbps | ~2–3 |

If you outgrow this, switch to YouTube Live and embed the stream instead.

## Go live

1. Put the site on GitHub Pages (below).
2. On the phone at the coop, open `https://<your-username>.github.io/RoosterLive/broadcast.html`.
3. Tap **Start broadcast** and allow camera and microphone.
4. Share `https://<your-username>.github.io/RoosterLive/` with viewers.

Tips for the coop phone: keep it on a charger, turn off battery saver, keep the browser tab in the foreground, and use Wi‑Fi rather than mobile data.

## Put it on GitHub Pages

1. Push this repository to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then **Save**.
4. After a minute the site is live at `https://<your-username>.github.io/RoosterLive/`.

GitHub Pages serves over HTTPS, which browsers require for camera access.

## Make it yours

All settings are in [`js/config.js`](js/config.js):

- `streamId` — the broadcast's address on the PeerJS server. Change it to your own long random string; viewers and broadcaster must use the same one.
- `coop.name`, `coop.latitude`, `coop.longitude`, `coop.timeZone` — used for the crow countdown and sunrise times.
- `crowMinutesBeforeSunrise` — how early your roosters start.
- `iceServers` — add a TURN server here if some viewers never get video (see Troubleshooting).

**The flock:** edit [`data/flock.json`](data/flock.json). Put real photos in `images/flock/` (square images work best) and point `photo` at them.

**The gallery:** use **Save snapshot** on the broadcast page, put the images in `images/gallery/`, and list them in [`data/gallery.json`](data/gallery.json):

```json
[
  { "src": "images/gallery/first-crow.jpg", "caption": "Sultan's first crow of the season", "date": "19 Oct 2026" }
]
```

## Run it locally

The pages load JSON files, so open them through a local server rather than double-clicking:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 (viewer) and http://localhost:8000/broadcast.html (broadcaster). Browsers allow the camera on `localhost` without HTTPS.

## Troubleshooting

- **"The coop is off air" even though I'm broadcasting** — check that `streamId` is identical on both sides (same `config.js`) and that the broadcast page says "You're live".
- **"Another broadcast is already live with this stream ID"** — another tab or device is broadcasting. Close it, or wait a minute for the PeerJS server to release the ID.
- **Some viewers connect to chat but never see video** — their network blocks direct peer-to-peer connections. Add a TURN server to `iceServers` (for example a free tier from metered.ca, or your own coturn server).
- **Video freezes when the phone screen turns off** — browsers pause the camera in the background. Keep the page open and the screen on.

## Files

```
index.html          viewer page
broadcast.html      broadcaster page (not linked in navigation, marked noindex)
css/style.css       styles
js/config.js        your settings
js/viewer.js        viewer connection, video and chat
js/broadcast.js     camera capture, sending video, chat relay, snapshots
js/chat-ui.js       shared chat rendering
js/crow.js          crow countdown and sun arc
js/sun.js           sunrise/sunset calculation
js/content.js       flock and gallery rendering
data/               flock.json, gallery.json
images/             flock photos, gallery photos, favicon
```

## Good to know

Anyone who finds `broadcast.html` could start a broadcast while yours is off. Using a long, private `streamId` makes that unlikely; viewers only ever see whoever holds that ID.
