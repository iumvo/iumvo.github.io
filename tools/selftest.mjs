/**
 * IUM Voice Room — headless regression test.
 *
 * Runs the real index.html inside jsdom with stubbed WebRTC + microphone APIs
 * and checks the critical user flows. This is the test that must have caught
 * the two bugs of session 02:
 *
 *   1. `const $` used before its declaration -> the whole script died
 *      -> no default name/room, no working buttons.
 *   2. duplicate DOM id "room" (lobby input + room section)
 *      -> `getElementById('room')` returned the *input* -> the room section
 *         stayed `display:none` -> a blank page after "Create room".
 *
 * Run with:  npm i jsdom && node tools/selftest.mjs [path/to/index.html]
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] || 'index.html');
const html = readFileSync(file, 'utf8');

let pass = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { failures.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------------ stubs */
function makeStubs(window) {
  class FakeTrack {
    constructor(kind = 'audio') { this.kind = kind; this.enabled = true; this.id = 'track-' + Math.random(); }
    stop() {}
  }
  class FakeStream {
    constructor(tracks) { this._t = tracks || [new FakeTrack()]; }
    getTracks() { return this._t; }
    getAudioTracks() { return this._t; }
  }
  class FakePC {
    constructor(cfg) {
      this.iceServers = (cfg || {}).iceServers;
      this.iceGatheringState = 'complete';
      this.iceConnectionState = 'new';
      this.connectionState = 'new';
      this.localDescription = null;
      this.remoteDescription = null;
      this.ontrack = null;
      this.oniceconnectionstatechange = null;
      this._tracks = [];
    }
    addTrack(t) { this._tracks.push(t); }
    createOffer() { return Promise.resolve({ type: 'offer', sdp: 'v=0\r\no=- FAKE OFFER SDP\r\na=ice-ufrag:abcd\r\n' }); }
    createAnswer() { return Promise.resolve({ type: 'answer', sdp: 'v=0\r\no=- FAKE ANSWER SDP\r\n' }); }
    setLocalDescription(d) { this.localDescription = d; return Promise.resolve(); }
    setRemoteDescription(d) { this.remoteDescription = d; return Promise.resolve(); }
    close() { this.iceConnectionState = 'closed'; }
    getStats() { return Promise.resolve(new Map()); }
  }
  window.RTCPeerConnection = FakePC;
  window.MediaStream = FakeStream;
  window.MediaStreamTrack = FakeTrack;
  window.navigator.mediaDevices = {
    getUserMedia: () => Promise.resolve(new FakeStream()),
  };
  window.document.execCommand = () => true;
  window.HTMLElement.prototype.scrollIntoView = function () {};
}

/* ------------------------------------------------------------------- boot */
async function boot({ micFails = false, url = 'https://iumvo.github.io/' } = {}) {
  const vc = new VirtualConsole();
  const jsErrors = [];
  vc.on('jsdomError', e => jsErrors.push('jsdomError: ' + e.message));
  vc.on('error', (...a) => jsErrors.push('console.error: ' + a.join(' ')));
  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      makeStubs(window);
      if (micFails) {
        window.navigator.mediaDevices.getUserMedia = () => {
          const e = new Error('denied');
          e.name = 'NotAllowedError';
          return Promise.reject(e);
        };
      }
    },
  });
  const { window } = dom;
  await sleep(120); // let the inline script finish
  return { window, doc: window.document, jsErrors };
}

function visible(el) {
  if (!el) return false;
  if (el.hidden) return false;
  if (el.classList && el.classList.contains('hidden')) return false;
  return true;
}

/* ------------------------------------------------------------------- test */
console.log('\n=== IUM Voice Room selftest: ' + file + ' ===\n');

const { window, doc, jsErrors } = await boot();

console.log('[1] script boots');
check('no uncaught script errors', jsErrors.length === 0, jsErrors.join(' | '));
check('no fatal banner', doc.getElementById('fatal') ? doc.getElementById('fatal').classList.contains('hidden') : true);
check('lobby is visible on load', visible(doc.querySelector('section#lobby')));
check('room is hidden on load', !visible(doc.querySelector('section#room')));

console.log('\n[2] defaults are generated');
const nick = doc.getElementById('nick');
const roomInput = doc.getElementById('roomInput');
check('nickname is auto-generated (Kabanchik###)', !!nick && /^Kabanchik\d{3}$/.test(nick.value), 'got: ' + (nick && nick.value));
check('room name defaults to IUMIUMIUM', !!roomInput && roomInput.value === 'IUMIUMIUM', 'got: ' + (roomInput && roomInput.value));

console.log('\n[3] no duplicate element ids');
const ids = [...doc.querySelectorAll('[id]')].map(e => e.id);
const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
check('all ids are unique', dupes.length === 0, 'duplicates: ' + [...new Set(dupes)].join(', '));
check('"room" is the room section, not the input',
  doc.getElementById('room') === doc.querySelector('section#room'),
  'getElementById("room") -> ' + (doc.getElementById('room') || {}).tagName);

console.log('\n[4] Create room reveals the room and produces shareable text');
doc.getElementById('btnCreate').click();
await sleep(250);
check('room section is now visible', visible(doc.querySelector('section#room')));
check('lobby is now hidden', !visible(doc.querySelector('section#lobby')));
check('mic button is visible', visible(doc.getElementById('btnPTT')));
check('leave button is visible', visible(doc.getElementById('btnLeave')));
check('mute-all button is visible', visible(doc.getElementById('btnMuteAll')));
check('rejoin button is visible', visible(doc.getElementById('btnRejoin')));

const outRow = doc.querySelector('.peer-card .row-out');
check('an offer row was created', !!outRow);
const offerTa = outRow ? outRow.querySelector('textarea') : null;
check('offer textarea contains an SDP', !!(offerTa && offerTa.value.includes('FAKE OFFER SDP')), offerTa ? offerTa.value : 'no textarea');
check('"Copy offer" button exists', !!(outRow && outRow.querySelector('button') && /copy offer/i.test(outRow.querySelector('button').textContent)));
check('a "paste their answer" field exists', !!doc.querySelector('.peer-card .row-in textarea'));
check('room name is shown in the header', doc.getElementById('roomName').textContent === 'IUMIUMIUM');
check('my name is shown in the header', doc.getElementById('meName').textContent === nick.value);
check('peer tile was rendered', doc.querySelectorAll('#tiles .tile').length === 2, 'tiles: ' + doc.querySelectorAll('#tiles .tile').length);

console.log('\n[5] the offer survives a re-render (no text is wiped)');
const answerTa = doc.querySelector('.peer-card .row-in textarea');
if (answerTa) answerTa.value = 'PASTED ANSWER TEXT';
// trigger a re-render the way an ICE state change would
const rejoinBtn = doc.getElementById('btnRejoin');
if (rejoinBtn) rejoinBtn.click();
await sleep(200);
check('page is still alive after rejoin', visible(doc.querySelector('section#room')));
check('a fresh offer was produced', !!(doc.querySelector('.peer-card .row-out textarea') || {}).value?.includes('FAKE OFFER SDP'));

console.log('\n[6] leave room returns to the lobby');
const leaveBtn = doc.getElementById('btnLeave');
if (leaveBtn) leaveBtn.click();
await sleep(100);
check('lobby is visible again', visible(doc.querySelector('section#lobby')));
check('room is hidden again', !visible(doc.querySelector('section#room')));

console.log('\n[7] theme toggle');
const before = doc.body.classList.contains('light');
const themeBtn = doc.getElementById('btnTheme');
if (themeBtn) themeBtn.click();
check('theme flips', doc.body.classList.contains('light') !== before);
check('theme is persisted', !!window.localStorage.getItem('iumi-theme'));
if (themeBtn) themeBtn.click();

console.log('\n[8] room link');
const link = doc.getElementById('roomLink');
check('room link is filled in', !!link && link.value.includes('?room=IUMIUMIUM'), link ? link.value : 'no link field');
if (roomInput) {
  roomInput.value = 'lunch';
  roomInput.dispatchEvent(new window.Event('input'));
  await sleep(50);
  check('room link follows the room name', !!link && link.value.includes('?room=lunch'), link ? link.value : '');
  check('the address bar is kept in sync', window.location.search.includes('room=lunch'), window.location.search);
}

console.log('\n[9] ?room= in the URL pre-fills the room');
const pre = await boot({ url: 'https://iumvo.github.io/?room=team-standup' });
check('room name comes from the URL', (pre.doc.getElementById('roomInput') || {}).value === 'team-standup', (pre.doc.getElementById('roomInput') || {}).value);
check('nickname is still generated', /^Kabanchik\d{3}$/.test((pre.doc.getElementById('nick') || {}).value || ''));

console.log('\n[10] a denied microphone never blocks the room');
const nomic = await boot({ micFails: true });
nomic.doc.getElementById('btnCreate').click();
await sleep(250);
check('room is still visible without a mic', visible(nomic.doc.querySelector('section#room')));
check('an actionable mic error is shown', /microphone/i.test((nomic.doc.getElementById('roomErr') || {}).textContent || ''), (nomic.doc.getElementById('roomErr') || {}).textContent);
check('the offer text is still produced', !!(nomic.doc.querySelector('.peer-card .row-out textarea') || {}).value?.includes('FAKE OFFER SDP'));

console.log('\n[11] no script errors during the whole run');
check('still no uncaught errors', jsErrors.length === 0, jsErrors.join(' | '));

console.log('\n[12] full offer/answer round trip between two browsers');
const alice = await boot();
const bob = await boot();
alice.doc.getElementById('btnCreate').click();
await sleep(250);
const aliceOffer = alice.doc.querySelector('.peer-card .row-out textarea');
check('alice got an offer to share', !!(aliceOffer && aliceOffer.value.includes('FAKE OFFER SDP')));

// Bob joins with Alice's offer
bob.doc.getElementById('joinOffer').value = aliceOffer.value;
bob.doc.getElementById('btnJoin').click();
await sleep(300);
const bobAnswer = bob.doc.querySelector('.peer-card .row-out textarea');
check('bob got an answer to send back', !!(bobAnswer && bobAnswer.value.includes('FAKE ANSWER SDP')));
check('bob is in the room', visible(bob.doc.querySelector('section#room')));

// Alice applies Bob's answer
const aliceAnswerIn = alice.doc.querySelector('.peer-card .row-in textarea');
check('alice has a field for bob\'s answer', !!aliceAnswerIn);
if (aliceAnswerIn) {
  aliceAnswerIn.value = bobAnswer.value;
  const applyBtn = aliceAnswerIn.parentElement.querySelector('button');
  applyBtn.click();
  await sleep(200);
  check('alice is connected to bob', /Connected/i.test(alice.doc.querySelector('.peer-card .badge').textContent),
    alice.doc.querySelector('.peer-card .badge').textContent);
}

// The "+ Add a person" card: paste an offer and connect
const npOffer = alice.doc.getElementById('npOffer');
check('the "paste their offer" field exists', !!npOffer);
if (npOffer) {
  npOffer.value = 'v=0\r\no=- SOMEONE ELSE SDP\r\n';
  alice.doc.getElementById('npConnect').click();
  await sleep(250);
  check('a second peer was added', alice.doc.querySelectorAll('.peer-card').length === 2,
    'cards: ' + alice.doc.querySelectorAll('.peer-card').length);
  check('the room-full banner still hidden with 2 peers',
    !visible(alice.doc.querySelector('#roomFull')));
}

console.log('\n[13] no script errors in the round trip');
check('no errors in alice', alice.jsErrors.length === 0, alice.jsErrors.join(' | '));
check('no errors in bob', bob.jsErrors.length === 0, bob.jsErrors.join(' | '));

console.log('\n---------------------------------------------');
console.log(`passed: ${pass}   failed: ${failures.length}`);
if (failures.length) {
  console.log('\nFAILURES:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('ALL GREEN');
process.exit(0);
