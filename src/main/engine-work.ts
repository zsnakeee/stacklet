import { yieldToEventLoop } from '../shared/yield-to-ui';

/** Serialize engine jobs and yield before each so the UI thread stays responsive. */
let chain: Promise<unknown> = Promise.resolve();

export function runEngineWork<T>(work: () => Promise<T>): Promise<T> {
  const job = chain.then(async () => {
    await yieldToEventLoop();
    return work();
  });
  chain = job.catch(() => {});
  return job;
}
