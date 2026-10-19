// Raceway Live settings — edit these to match your track.
window.RACE_CONFIG = {
  siteName: "Raceway Live",
  trackName: "the farm track",
  timeZone: "Asia/Kolkata",

  // Every page (viewer, cameras, race control) must use the same streamId.
  // Make it long and private: anyone who knows it could broadcast under it.
  streamId: "raceway-rv-4c81d7e2a9",

  // One entry per camera position. Open camera.html on a phone and pick a slot.
  // ids: letters, numbers and dashes only.
  cameras: [
    { id: "start", label: "Start line" },
    { id: "hairpin", label: "Hairpin" },
    { id: "pits", label: "Pit lane" },
  ],

  // STUN servers help browsers find a route to each other. If some viewers
  // never get video, add a TURN server here (e.g. metered.ca or coturn).
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],

  chat: { maxLength: 280, historySize: 50 },
};

// Peer IDs derived from streamId — don't edit.
window.RACE_IDS = {
  hub: () => `${window.RACE_CONFIG.streamId}-control`,
  camera: (id) => `${window.RACE_CONFIG.streamId}-cam-${id}`,
};
