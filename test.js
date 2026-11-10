// node test.js: offline tests against a fake fetch (real response shapes). node test.js --live adds the free live checks.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FreeImageToVideo, FreeImageToVideoError } = require('./client');

const MP4 = 'https://cdn.freeimagetovideo.ai/v/task_1.mp4';
const ok = (data) => ({ code: 0, message: 'ok', data });
const SUBMITTED = ok({ id: 'task_1', status: 'pending' });

function fake(answer, calls = []) {
  return async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization });
    const a = answer(url);
    const [status, body] = Array.isArray(a) ? a : [200, a];
    return { status, json: async () => { if (body === undefined) throw new Error('not json'); return body; } };
  };
}
const client = (answer, calls, apiKey = 'sk-test') => new FreeImageToVideo({ apiKey, baseUrl: 'https://t', fetch: fake(answer, calls) });
const seq = (list) => () => (list.length > 1 ? list.shift() : list[0]);

async function offline() {
  // text to video: pending -> processing (queued) -> success; body shape; query by data.id
  let calls = [];
  let polls = seq([ok({ id: 'task_1', status: 'pending', videos: [] }), ok({ id: 'task_1', status: 'processing', queued: true, queueEta: 40 }),
    ok({ id: 'task_1', status: 'success', videos: [MP4] })]);
  let c = client((u) => (u.endsWith('/api/ai/generate') ? SUBMITTED : polls()), calls);
  assert.strictEqual(await c.generateVideo('a paper lantern drifting over a night river', { pollMs: 1 }), MP4);
  assert.deepStrictEqual(calls[0], {
    url: 'https://t/api/ai/generate', auth: 'Bearer sk-test',
    body: { provider: 'auto', mediaType: 'video', model: 'minimax-h3', scene: 'text-to-video', prompt: 'a paper lantern drifting over a night river', options: { sound: true } },
  });
  assert.deepStrictEqual(calls[1].body, { taskId: 'task_1' });
  assert.strictEqual(calls[1].url, 'https://t/api/ai/query');
  assert.strictEqual(calls.length, 4);

  // image to video + options
  calls = [];
  await client(() => SUBMITTED, calls).submit('the camera orbits the statue', { imageUrl: 'https://e.com/s.jpg', options: { duration: 6, aspect_ratio: '9:16', resolution: undefined } });
  assert.deepStrictEqual(calls[0].body, {
    provider: 'auto', mediaType: 'video', model: 'minimax-h3', scene: 'image-to-video', prompt: 'the camera orbits the statue',
    options: { duration: 6, aspect_ratio: '9:16', sound: true, image_input: ['https://e.com/s.jpg'] },
  });

  // failed / canceled -> generation
  c = client((u) => (u.endsWith('/api/ai/generate') ? SUBMITTED : ok({ id: 'task_1', status: 'failed', errorMessage: 'upstream error', failureKind: 'provider' })));
  await assert.rejects(c.generateVideo('x', { pollMs: 1 }), (e) => e.kind === 'generation' && /upstream error/.test(e.message) && e.failureKind === 'provider' && e.taskId === 'task_1');
  c = client((u) => (u.endsWith('/api/ai/generate') ? SUBMITTED : ok({ id: 'task_1', status: 'canceled' })));
  await assert.rejects(c.generateVideo('x', { pollMs: 1 }), (e) => e.kind === 'generation');

  // error classification (as fitv.go Classify)
  const invalid = [401, { code: -1, message: 'Invalid API key. Create one at https://freeimagetovideo.ai/settings/apikeys', data: { reason: 'invalid_api_key' } }];
  await assert.rejects(client(() => invalid, [], 'sk-bad').credits(), (e) => e.kind === 'auth' && e.status === 401);
  await assert.rejects(client(() => invalid, [], 'sk-bad').submit('x'), (e) => e.kind === 'auth');
  await assert.rejects(client(() => [401, undefined]).status('t'), (e) => e.kind === 'auth');
  await assert.rejects(client(() => ({ code: -1, message: 'no auth, please sign in' })).status('t'), (e) => e.kind === 'auth');
  await assert.rejects(client(() => ({ code: -2, message: 'blocked by the content filter' })).submit('x'), (e) => e.kind === 'rejected');
  await assert.rejects(client(() => ({ code: -3, message: 'cooldown' })).submit('x'), (e) => e.kind === 'rejected');
  await assert.rejects(client(() => ({ code: -1, message: 'not enough credits', data: { reason: 'insufficient_credits' } })).submit('x'),
    (e) => e.kind === 'quota' && e.message.includes('https://freeimagetovideo.ai/pricing'));
  await assert.rejects(client(() => ({ code: -1, message: 'API runs need a paid plan', data: { reason: 'plan_required' } })).submit('x'), (e) => e.kind === 'plan');
  await assert.rejects(client(() => ({ code: -1, message: 'too many at once', data: { reason: 'concurrency' } })).submit('x'), (e) => e.kind === 'busy');
  await assert.rejects(client(() => ({ code: -1, message: 'prompt too long' })).submit('x'), (e) => e.kind === 'api' && e.message === 'prompt too long');
  // HTTP 200 + code != 0 is never success
  await assert.rejects(client(() => ({ code: 7, message: 'odd', data: { id: 'x' } })).submit('x'), FreeImageToVideoError);

  // no key: no request at all, auth
  calls = [];
  await assert.rejects(client(() => SUBMITTED, calls, '').submit('x'), (e) => e.kind === 'auth' && /settings\/apikeys/.test(e.message));
  assert.strictEqual(calls.length, 0);

  // a dropped poll (non-JSON 502) keeps polling
  polls = seq([[502, undefined], ok({ id: 'task_1', status: 'success', videos: [MP4] })]);
  assert.strictEqual(await client(() => polls()).wait('task_1', { pollMs: 1 }), MP4);

  // credits, timeout, empty prompt, no id
  calls = [];
  assert.strictEqual(await client(() => ok({ remainingCredits: 42 }), calls).credits(), 42);
  assert.strictEqual(calls[0].url, 'https://t/api/user/get-user-credits');
  c = client((u) => (u.endsWith('/api/ai/generate') ? SUBMITTED : ok({ id: 'task_1', status: 'processing' })));
  await assert.rejects(c.generateVideo('x', { timeoutMs: 30, pollMs: 5 }), (e) => e.kind === 'timeout');
  await assert.rejects(client(() => SUBMITTED).submit(' '), (e) => e.kind === 'validation');
  await assert.rejects(client(() => ok({})).submit('x'), (e) => e.kind === 'api');

  // the action end to end: inputs in, video-url out
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fitv-')), 'out.txt');
  Object.assign(process.env, { INPUT_PROMPT: 'a fox trotting through snow', 'INPUT_API-KEY': 'sk-test', 'INPUT_IMAGE-URL': 'https://e.com/fox.jpg',
    INPUT_DURATION: '6', 'INPUT_ASPECT-RATIO': '9:16', 'INPUT_TIMEOUT-MINUTES': '1', GITHUB_OUTPUT: out });
  calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = fake((u) => (u.endsWith('/api/ai/generate') ? SUBMITTED : ok({ id: 'task_1', status: 'success', videos: [MP4] })), calls);
  const log = console.log;
  console.log = () => {};
  try { await require('./index').main(); } finally { globalThis.fetch = realFetch; console.log = log; }
  assert.ok(fs.readFileSync(out, 'utf8').includes(`video-url=${MP4}`));
  assert.strictEqual(calls[0].auth, 'Bearer sk-test');
  assert.deepStrictEqual(calls[0].body.options, { duration: 6, aspect_ratio: '9:16', sound: true, image_input: ['https://e.com/fox.jpg'] });
  assert.strictEqual(calls[0].body.scene, 'image-to-video');
  console.log('offline tests ok');
}

async function live() {
  const bad = new FreeImageToVideo({ apiKey: 'sk-invalidtest000' });
  await assert.rejects(bad.submit('a paper lantern drifting over a night river'), (e) => e.kind === 'auth' && e.status === 401);
  console.log('live ok: wrong key -> generate -> auth');
  await assert.rejects(bad.credits(), (e) => e.kind === 'auth');
  console.log('live ok: wrong key -> credits -> auth');
}

(async () => {
  await offline();
  if (process.argv.includes('--live')) await live();
})().catch((e) => { console.error(e); process.exit(1); });
