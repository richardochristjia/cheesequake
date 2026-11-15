// Paced JSON fetch: one client per host, calls serialised, retry on 429/5xx/network/in-body 429.
export function createClient({ fetch, sleep, now, minGapMs, retry }) {
  let chain = Promise.resolve();
  let last = -Infinity;

  const fail = (msg) => Object.assign(new Error(msg), { code: 'SOURCE_UNAVAILABLE' });

  async function attempt(url, init) {
    for (let i = 0; i < retry.tries; i++) {
      const wait = last + minGapMs - now();
      if (wait > 0) await sleep(wait);
      last = now();
      let retryable = false;
      try {
        const res = await fetch(url, init);
        if (res.status === 429 || res.status >= 500) retryable = true;
        else if (!res.ok) throw fail(`HTTP ${res.status} ${url}`);
        else {
          const body = await res.json();
          if (body?.error?.code === 429) retryable = true;
          else return body;
        }
      } catch (e) {
        if (e.code === 'SOURCE_UNAVAILABLE') throw e;
        retryable = true; // network error or bad JSON
      }
      if (retryable && i < retry.tries - 1) await sleep(retry.waitsMs[Math.min(i, retry.waitsMs.length - 1)]);
    }
    throw fail(`gave up on ${url}`);
  }

  return (url, init) => {
    const run = chain.then(() => attempt(url, init));
    chain = run.catch(() => {});
    return run;
  };
}
