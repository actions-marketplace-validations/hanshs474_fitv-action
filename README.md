# Free Image to Video (GitHub Action)

Free image to video AI with no daily cap: start with no sign-up, keep going on a free account. Every video comes with sound and no watermark. This is the official GitHub Action for [Free Image to Video](https://freeimagetovideo.ai/?utm_source=github-action&utm_medium=package): give it a photo URL or a prompt and it hands back the URL of a finished MP4 clip.

Use it to [animate a photo](https://freeimagetovideo.ai/video/animate-photo-ai) from your release assets, turn a changelog line into a short teaser, or refresh a demo clip on a schedule. Every clip is [image to video AI with sound](https://freeimagetovideo.ai/video/image-to-video-ai-with-sound): the soundtrack comes in the same pass.

Photo to video (the photo is the first frame):

```yaml
- uses: hanshs474/fitv-action@v1
  id: clip
  with:
    api-key: ${{ secrets.FREEIMAGETOVIDEO_API_KEY }}
    image-url: https://example.com/statue.jpg
    prompt: "the camera slowly orbits the statue, warm evening light"
    aspect-ratio: "9:16"
- run: echo "${{ steps.clip.outputs.video-url }}"
```

Text to video, saved into the repository:

```yaml
- uses: hanshs474/fitv-action@v1
  with:
    api-key: ${{ secrets.FREEIMAGETOVIDEO_API_KEY }}
    prompt: "a paper lantern drifting over a night river, slow push-in"
    duration: "6"
    output-path: assets/teaser.mp4
```

## Inputs

| Input | |
|---|---|
| `prompt` | required. What happens in the clip: the motion, the camera, the mood |
| `api-key` | required. Create a key at https://freeimagetovideo.ai/settings/apikeys and store it as a repository secret `FREEIMAGETOVIDEO_API_KEY` |
| `image-url` | optional. A public https image; set it for image to video, leave it empty for text to video |
| `duration` | optional. `4`, `5`, `6`, `8`, `10` or `15` seconds |
| `resolution` | optional. `480p` or `768p` |
| `aspect-ratio` | optional. `16:9`, `9:16` or `1:1` |
| `output-path` | optional. Download the MP4 to this path in the workspace |
| `timeout-minutes` | optional, default 30 |

Model: MiniMax H3 (`minimax-h3`), the model the site runs.

## Outputs

| Output | |
|---|---|
| `video-url` | URL of the finished MP4 |
| `path` | where the MP4 was saved, if `output-path` was set |
| `id` | the Free Image to Video task id |

## API key and plan

API runs need a paid plan: each run draws on the plan's daily full-speed allowance, then waits in the relaxed queue, and the action keeps polling (every 10 seconds) until the clip is ready or `timeout-minutes` passes. See [pricing](https://freeimagetovideo.ai/pricing?utm_source=github-action&utm_medium=package). To make clips without a key, use the generator on the website: start with no sign-up, keep going on a free account.

The step fails with the service's own message on a missing or wrong key, an account without a paid plan, too many runs at once, or a prompt the content filter refused.

No dependencies (`node test.js` runs the offline tests, `node test.js --live` adds two free live checks with a wrong key). Questions: support@freeimagetovideo.ai. MIT licensed.
