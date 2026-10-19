// RoosterLive settings — edit these to match your farm.
window.SITE_CONFIG = {
  siteName: "RoosterLive",
  farmName: "the farm",

  // Every page (viewer, cameras, host) must use the same streamId.
  // Make it long and private: anyone who knows it could broadcast under it.
  streamId: "roosterlive-rv-4c81d7e2a9",

  // One entry per camera spot. Open camera.html on a phone and pick a spot.
  // ids: letters, numbers and dashes only.
  cameras: [
    { id: "yard", label: "Main yard" },
    { id: "coop", label: "Coop door" },
    { id: "feed", label: "Feeding area" },
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
window.SITE_IDS = {
  hub: () => `${window.SITE_CONFIG.streamId}-host`,
  camera: (id) => `${window.SITE_CONFIG.streamId}-cam-${id}`,
};
