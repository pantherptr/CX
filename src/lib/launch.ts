/** While true, the home page shows the "coming soon" phone hero in place of the swipe deck. Set to false the day the
 *  site goes live (the deck, and everything behind it, comes back). */
export const LAUNCH_HOLD = false;

/** The open Reels feed (/signal/reels with no post). Off for launch: videos are the heaviest thing we serve, and a feed
 *  with a handful of videos feels empty. The full-screen video player (a tapped video in a post: /signal/reels?post=…)
 *  stays on either way. Turn this on once there is enough video and the plan can carry it. */
export const REELS_FEED = false;

/** ElevenLabs speaker buttons (X answers, SIGNAL "Listen"). OFF while the ElevenLabs account is on the free plan
 *  (library voices need a paid plan). Set to true once the plan is paid; VITE_VOICE=1 must also be set. */
export const VOICE_FEATURE = false;
