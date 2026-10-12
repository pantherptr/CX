import { fetchSignalProfile } from './signalProfile';
import { recallProfile, rememberProfile } from './seedCache';

const inFlight = new Set<string>();

/** Starts loading a profile the moment a finger touches a link to it, so by the time the tap lands the
 *  data is often already there. Fire-and-forget; failures are silent. */
export function prefetchProfile(authorId: string | null | undefined) {
  if (!authorId || inFlight.has(authorId) || recallProfile(authorId)?.profile) return;
  inFlight.add(authorId);
  fetchSignalProfile(authorId)
    .then((p) => { if (p) rememberProfile(authorId, { profile: p }); })
    .catch(() => {})
    .finally(() => inFlight.delete(authorId));
}
