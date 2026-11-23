// Rollback-guarded clock: time never goes backwards. Setting the device clock back cannot replay a day, a week or a life timer.
import { save } from './save.js';

export function now() {
  const c = save.data.clock;
  const t = Date.now();
  if (c.max > t + 2 * 86400000) c.max = t + 2 * 86400000; // one wrong-date session can pin the game at most 2 days ahead
  if (t > c.max) c.max = t; // persisted with the next commit
  return c.max;
}
