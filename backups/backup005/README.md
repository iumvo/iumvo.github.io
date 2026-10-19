# Voice Room

A **simplest possible** push-to-talk voice room:

*   **Plain HTML/CSS/JS** — one file (`index.html`), no build step, no frameworks.
*   **Serverless** — peer-to-peer via WebRTC. Nothing to host, maintain, or pay for.
*   **Free** — uses only free public STUN servers for NAT traversal.
*   **Small** — one room, max 4 people, no accounts, no database.
*   **Easy to deploy** — static site. Works on GitHub Pages, Cloudflare Pages, Netlify Drop, or any static host.
*   **Casual-conversation grade** — no recording, no text chat, no profiles, no unnecessary features.

## How it works

Your browser creates a peer-to-peer WebRTC connection directly to each other person's browser. Audio never passes through a server.

Because there is no signaling server, you and the other people exchange **offer/answer text directly** (copy & paste):

1.  One person clicks **Create room**.
2.  They click **Make an offer to share** and send that blob of text to a friend (any way: chat, email, in person).
3.  The friend pastes it under **Paste their offer**, enters a name, clicks **Connect**, and sends the **Your answer → send to them** blob back.
4.  The creator pastes that answer under **Paste their answer** and clicks **Apply**.
5.  Repeat until everyone is connected (max 4 total). Then hold **Hold to speak** (or the **Space bar**) to talk; release to mute.

## Deploy

### GitHub Pages

1.  Create a new public repo (e.g. `voice-room`).
2.  Upload `index.html` (and this `README.md`).
3.  Settings → Pages → Build and deployment → Source: **Deploy from a branch** → `main` / root.
4.  Your room is live at `https://<user>.github.io/voice-room/`.

### Cloudflare Pages

1.  Upload `index.html` via the Cloudflare Pages dashboard (or connect the repo).
2.  It's live instantly on a `*.pages.dev` domain.

### Anywhere else

`index.html` is a single static file. Drop it on Netlify Drop, Vercel, Surge, S3, or open it directly from your filesystem (`file://`) — though microphone access requires HTTPS in most browsers, so a real host is recommended.

## How to use

*   **Hold to speak** — click and hold the big button (or hold **Space**). Release to mute.
*   **Mic starts muted** — nobody hears you until you push-to-talk.
*   **Up to 3 other people** (4 total). Each person needs their own offer/answer exchange with everyone else they want to hear.
*   **Leave** — click Leave room to close all connections.

## Caveats

*   **No TURN server.** If two people are behind restrictive/symmetric NATs, the direct connection may fail. For most home/office networks the public STUN servers are enough. If a connection fails, try a different network.
*   **HTTPS required.** Browsers only allow microphone access on secure contexts (localhost or HTTPS). All the hosts above serve HTTPS automatically.
*   **Copy & paste signaling.** There's no server to match people up, so you must share the offer/answer blobs out-of-band. This is the price of "no server to maintain."
*   **No moderation.** Anyone with the offer text can join. Only share it with people you trust.

## Files

*   `index.html` — the entire app (HTML, CSS, JS).
*   `README.md` — this file.
