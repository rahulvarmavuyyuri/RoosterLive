// RoosterLive settings — edit these to match your coop.
window.ROOSTER_CONFIG = {
  siteName: "RoosterLive",

  // The broadcaster registers under this ID and viewers connect to it.
  // Make it long and unique so nobody else on the PeerJS cloud uses it.
  streamId: "roosterlive-coop-rv-7f3a9c2e",

  coop: {
    name: "our backyard coop",
    // Used to work out sunrise, sunset and the next crow.
    latitude: 17.385,
    longitude: 78.4867,
    timeZone: "Asia/Kolkata",
  },

  // Roosters usually start crowing a little before sunrise.
  crowMinutesBeforeSunrise: 30,

  // STUN servers help viewers find a route to the broadcaster.
  // If some viewers never get video (strict mobile/corporate networks),
  // add a TURN server here, e.g. from metered.ca or your own coturn.
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],

  // Chat limits
  chat: {
    maxLength: 280,
    historySize: 50,
  },
};
