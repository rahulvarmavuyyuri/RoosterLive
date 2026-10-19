# RoosterLive

Show your roosters live to friends and family. Phones around the farm stream straight to viewers' browsers on mobile or laptop, and a host page runs the chat and tells viewers which bird they're looking at. Everything runs on GitHub Pages: no streaming server, no monthly bill.

**Viewers get**

- Live video with sound, switching between farm cameras (main yard, coop door, feeding area…)
- "On camera now": the bird in the spotlight, with breed and a short description
- Yard chat with everyone watching
- Meet the flock: breed, age, weight, comb, bloodline and breeding availability for every bird
- Best times to watch (morning crow, feeding, sunset)

## The three pages

| Page | Who opens it | What it does |
|---|---|---|
| `index.html` | Friends | Watch, see who's on camera, chat |
| `camera.html` | One phone per camera spot | Streams that spot's camera |
| `host.html` | You (one device) | Runs the chat and picks the bird in the spotlight |

`camera.html` and `host.html` aren't linked from the viewer page and are hidden from search engines.

## Going live

1. **Cameras:** on each phone, open `…/camera.html`, choose its spot, tap **Go live** and allow camera and microphone. Plug the phone into power and keep the screen on. You can preselect a spot with `camera.html?cam=coop`.
2. **Host:** on your own phone or laptop, open `…/host.html`. It goes online by itself.
3. **Share** `https://<your-username>.github.io/RoosterLive/` with friends.
4. When you bring a bird in front of a camera, choose that camera on the host page and tap the bird. Viewers see its name and details, and anyone who hasn't picked a camera themselves switches to that view. Tap the bird again or **Clear spotlight** when you're done.

## Put it on GitHub Pages

1. In the repo, go to **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then **Save**.
3. After a minute the site is live at `https://<your-username>.github.io/RoosterLive/`.

GitHub Pages serves over HTTPS, which browsers require for camera access.

## Make it yours

**Settings:** [`js/config.js`](js/config.js)

- `siteName`, `farmName`
- `streamId`: change to your own long random string. All pages must share it.
- `cameras`: your camera spots (add or remove entries).
- `iceServers`: add a TURN server if some viewers never get video.

**Your birds:** [`data/flock.json`](data/flock.json). Each bird has `id`, `name`, `breed`, `age`, `weight`, `comb`, `bloodline`, `about`, `available` (true/false) and `photo`. Put square photos in `images/flock/` and point `photo` at them.

**Best times to watch:** [`data/schedule.json`](data/schedule.json). Each entry has `time`, `title`, `details` and `when`.

Commit and push after editing; GitHub Pages updates in about a minute. Reload the host page after changing the flock.

## How many viewers?

Each camera phone sends a separate copy of its video to every viewer on that camera, so its upload speed sets the limit. Roughly, on 10 Mbps upload: about 10 viewers at 480p, 5 at 720p, 2–3 at 1080p. Viewers spread across cameras share the load.

## Run it locally

```bash
python3 -m http.server 8000
```

Open http://localhost:8000, http://localhost:8000/camera.html and http://localhost:8000/host.html. Browsers allow the camera on `localhost` without HTTPS.

## Troubleshooting

- **"No cameras are live"** while a camera says it's live: check all pages use the same `config.js`, then wait up to 8 seconds; viewers re-check automatically.
- **"Another phone is already live as …"**: two phones chose the same spot. Pick a different one.
- **"The host page is already open on another device or tab"**: close the other one and reload.
- **Chat works but no video** for some viewers: their network blocks peer-to-peer. Add a TURN server to `iceServers`.
- **Video freezes when the phone screen turns off**: keep the camera page open with the screen on.

## Files

```
index.html, camera.html, host.html
css/style.css
js/config.js     settings
js/viewer.js     viewer: camera switching, spotlight, chat
js/camera.js     camera capture and streaming
js/host.js       host: chat hub and spotlight
js/content.js    flock, schedule and spotlight rendering
js/chat-ui.js    chat rendering (shared)
data/            flock.json, schedule.json
images/          bird pictures, favicon
```
