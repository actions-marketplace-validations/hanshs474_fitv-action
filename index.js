// Free Image to Video GitHub Action. Plain node, no dependencies: inputs come from INPUT_* env vars,
// outputs go to $GITHUB_OUTPUT.
'use strict';
const fs = require('fs');
const path = require('path');
const { FreeImageToVideo } = require('./client');

const input = (name) => (process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '').trim();

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  console.log(`${name}=${value}`);
}

function options() {
  const o = {};
  if (input('duration')) o.duration = Number(input('duration'));
  if (input('resolution')) o.resolution = input('resolution');
  if (input('aspect-ratio')) o.aspect_ratio = input('aspect-ratio');
  return o;
}

async function main() {
  const key = input('api-key');
  if (key) console.log(`::add-mask::${key}`);
  const client = new FreeImageToVideo({ apiKey: key, userAgent: 'fitv-action/1.0.0' });
  const id = await client.submit(input('prompt'), { imageUrl: input('image-url') || undefined, options: options() });
  setOutput('id', id);
  console.log(`submitted run ${id}; polling every 10 seconds`);
  let last = '';
  const url = await client.wait(id, {
    timeoutMs: (Number(input('timeout-minutes')) || 30) * 60_000,
    onStatus: (d) => {
      const s = d.queued ? `${d.status} (queued${d.queueEta ? `, about ${Math.round(d.queueEta)}s` : ''})` : d.status;
      if (s !== last) console.log(`run ${id}: ${s}`);
      last = s;
    },
  });
  setOutput('video-url', url);
  const out = input('output-path');
  if (out) {
    const target = path.resolve(process.env.GITHUB_WORKSPACE || '.', out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(await (await fetch(url)).arrayBuffer()));
    setOutput('path', target);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.log(`::error::${err.message || err}`);
    process.exit(1);
  });
}

module.exports = { main };
