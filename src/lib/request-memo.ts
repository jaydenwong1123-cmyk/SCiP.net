import { cache } from "react";
import { headers } from "next/headers";

// Per-request memoization that also holds inside Server Actions and Route
// Handlers.
//
// React's cache() only memoizes while a Server Component render is running.
// A server action executes before any render (Next runs it under its own
// request storage, not React's), and a route handler never renders at all —
// there, cache() quietly calls straight through. So getSiteConfig(), which
// every gate in requireUser() reads, was a fresh database round trip each time
// it was called from an action: four or five of them for a single siege
// answer, and the same again on every other action on the site.
//
// Inside a render this defers to React's cache(), exactly as before. Outside
// one, it keys the result on the request's headers object, which Next hands
// out once per request. A re-render that follows the action in the same
// response (revalidatePath) is a render, so it reads fresh values rather than
// the action's.
//
// Where there is no request at all — a script, a test, an after() callback in
// a Server Component — it calls through, uncached.

const probe = cache(() => ({}));
const inRender = () => probe() === probe();

export function requestMemo<T>(fn: () => Promise<T>): () => Promise<T> {
  const rendered = cache(fn);
  const byRequest = new WeakMap<object, Promise<T>>();
  return () => {
    if (inRender()) return rendered();
    return (async () => {
      let key: object;
      try {
        key = await headers();
      } catch {
        return fn();
      }
      let pending = byRequest.get(key);
      if (!pending) {
        pending = fn();
        byRequest.set(key, pending);
        // A failed read must not stick for the rest of the request.
        pending.catch(() => byRequest.delete(key));
      }
      return pending;
    })();
  };
}
