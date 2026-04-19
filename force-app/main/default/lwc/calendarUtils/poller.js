/*
 Lightweight poller helper for LWC components.

 Usage:
 import { createPoller } from 'c/calendarUtils/poller';
 // inside component:
 this._poller = createPoller({
   fn: async () => { await doWork(); },
   intervalMs: 5000,
   maxAttempts: 12,
 });
 // start:
 this._poller.start();
 // stop:
 this._poller.stop();
*/
export function createPoller({ fn, intervalMs = 5000, maxAttempts = 12 }) {
  let attempts = 0;
  let stopped = false;
  let timerId = null;

    async function tick() {
      if (stopped) {
        return;
      }
      attempts++;
      try {
        await fn();
      } catch (e) {
        // swallow errors; caller may handle internally
      } finally {
        if (attempts >= maxAttempts) {
          stop();
          return;
        }
        scheduleNext();
      }
    }

    function scheduleNext() {
      // use setTimeout with a synchronous wrapper to avoid linter issues in components
      if (stopped) {
        return;
      }
      /* eslint-disable-next-line no-restricted-globals */
      timerId = window.setTimeout(() => {
        // fire-and-forget the async tick
        Promise.resolve().then(() => tick().catch(() => {}));
      }, intervalMs);
    }

  function start() {
    stop();
    stopped = false;
    attempts = 0;
    // first tick
    tick().catch(() => {});
  }

  function stop() {
    stopped = true;
    if (timerId !== null) {
      /* eslint-disable-next-line no-restricted-globals */
      clearTimeout(timerId);
      timerId = null;
    }
  }

  return { start, stop };
}