// Prova d'integració: el RelayHost real (TypeScript transpilat) parla amb el relé real,
// amb WebRTC simulat. Verifica el cicle sencer: unió -> oferta -> resposta -> entrada -> sortida.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createRelay } from '../relay.mjs';
import { connect, openSockets } from './helpers.mjs';

const require = createRequire(import.meta.url);
const ts = require('/home/claude/.npm-global/lib/node_modules/typescript');
afterEach(() => { for (const s of openSockets) s.destroy(); openSockets.clear(); });

const SRC = new URL('../../src/modules/', import.meta.url);
const transpile = file => ts.transpileModule(fs.readFileSync(new URL(file, SRC), 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2022' } }).outputText;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 2000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(10); } throw new Error('until: timeout'); };

function buildEnv(relayPort, prefsOverride = {}) {
    const prefs = { 'relay.enabled': true, 'relay.port': relayPort, 'relay.viewerMode': 'shared', 'relay.bitrate': 10,
        'gamepadAdapter.enabled': false, 'gamepadAdapter.swapFace': false, 'gamepadAdapter.deadzone': 8, ...prefsOverride };
    const events = [];            // gamepadconnected / disconnected
    const handlers = {};
    const toasts = [];
    const pcs = [];

    class MockPC {
        constructor() { this.listeners = {}; this.tracks = []; this.calls = []; this.connectionState = 'new'; pcs.push(this); }
        addEventListener(n, f) { (this.listeners[n] ||= []).push(f); }
        addTrack(t) { this.tracks.push(t); return {}; }
        async createOffer() { return { type: 'offer', sdp: 'v=0\r\na=candidate:1 1 udp 1 3b7d0a1c-1111-4222-8333-444455556666.local 5000 typ host\r\n' }; }
        async setLocalDescription(d) { this.localDescription = d; }
        async setRemoteDescription(d) { this.calls.push(['remote', d]); }
        async addIceCandidate(c) { this.calls.push(['ice', c]); }
        getSenders() { return [{ track: { kind: 'video' }, getParameters: () => ({}), setParameters: async p => { this.params = p; } }]; }
        close() { this.closed = true; }
        fire(n) { (this.listeners[n] || []).forEach(f => f({})); }
    }
    class MockStream { constructor(tracks = []) { this.tracks = tracks; } getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); } }
    const coopCalls = [];
    const audioInfo = { sinkMuted: null, ctxCreated: 0 };
    class MockAudio { constructor() { audioInfo.sinkMuted = null; } set muted(v) { audioInfo.sinkMuted = v; } play() { return Promise.resolve(); } }
    class MockAudioContext {
        constructor() { audioInfo.ctxCreated++; }
        createMediaStreamSource() { return { connect() {} }; }
        createMediaStreamDestination() { return { stream: new MockStream([{ kind: 'audio', id: 'processed' }]) }; }
        resume() { return Promise.resolve(); }
        close() { audioInfo.closed = true; }
    }

    const source = { getReceivers: () => [{ track: { kind: 'video', readyState: 'live', id: 'v-orig' } }, { track: { kind: 'audio', readyState: 'live', id: 'a-orig' } }] };
    const pillEl = { classList: { remove() {}, add() {} }, remove() { pillEl.removed = true; }, textContent: '' };

    const win = { setTimeout, clearTimeout, setInterval, clearInterval, performance, BX_EXPOSED: { toggleLocalCoOp: v => coopCalls.push(v) }, navigator: { getGamepads: () => [null, null, null, null] }, localStorage: (() => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; })() };
    class XboxOriginWebSocket extends WebSocket {
        constructor(url) { super(url, { headers: { Origin: 'https://www.xbox.com' } }); }
    }
    Object.assign(globalThis, { window: win, document: { documentElement: { appendChild() {} }, createElement() { return {}; } }, RTCPeerConnection: MockPC, MediaStream: MockStream, Audio: MockAudio, AudioContext: MockAudioContext });
    Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true, writable: true });
    win.WebSocket = XboxOriginWebSocket;
    globalThis.WebSocket = XboxOriginWebSocket;

    const stubs = {
        '@/enums/pref-keys': { GlobalPref: new Proxy({}, { get: (_, k) => ({
            RELAY_ENABLED: 'relay.enabled', RELAY_PORT: 'relay.port', RELAY_VIEWER_MODE: 'relay.viewerMode', RELAY_BITRATE: 'relay.bitrate',
            GAMEPAD_ADAPTER_ENABLED: 'gamepadAdapter.enabled', GAMEPAD_ADAPTER_SWAP_FACE: 'gamepadAdapter.swapFace', GAMEPAD_ADAPTER_DEADZONE: 'gamepadAdapter.deadzone' }[k]) }),
            StorageKey: { GAMEPAD_PROFILES: 'p' }, StreamPref: { LOCAL_CO_OP_ENABLED: 'localCoOp.enabled' } },
        '@utils/bx-event-bus': { BxEventBus: { Stream: { on: (e, f) => { handlers[e] = f; } } } },
        '@utils/bx-logger': { BxLogger: { info() {}, warning() {}, error(...a) { console.error('[ERR]', ...a); } } },
        '@utils/global': { AppInterface: null, STATES: { currentStream: { peerConnection: source } } },
        '@utils/html': { CE: () => pillEl },
        '@utils/pref-utils': { getGlobalPref: k => prefs[k], getStreamPref: () => false },
        '@utils/toast': { Toast: { show: (...a) => toasts.push(a) } },
        '@utils/translation': { t: (k, v) => k + (v ? ':' + JSON.stringify(v) : '') },
        '@utils/bx-event': { BxEvent: { dispatch: (_t, name, data) => events.push([name, data.gamepad.id, data.gamepad.index]) } },
    };

    const load = (file, name) => { const m = { exports: {} }; new Function('require', 'module', 'exports', transpile(file))(n => n === '@modules/gamepad-adapter' ? adapterMod : stubs[n], m, m.exports); return m.exports; };
    const adapterMod = load('gamepad-adapter.ts');
    const { RelayHost } = load('relay/relay-host.ts');
    const adapter = adapterMod.GamepadAdapter.getInstance();
    adapter.install();
    return { RelayHost, adapter, handlers, events, toasts, pcs, prefs, pillEl, coopCalls, audioInfo };
}

const frame = (buttons = {}, axes = [0, 0, 0, 0]) => {
    const f = Buffer.alloc(26); f[0] = 1;
    for (const [i, v] of Object.entries(buttons)) f[1 + +i] = v;
    axes.forEach((a, i) => f.writeInt16BE(Math.round(a * 32767), 18 + i * 2));
    return f;
};

test('cicle complet: host + espectador, mode compartit', async () => {
    const relay = createRelay({ pin: '424242', urlsProvider: p => [`http://192.168.1.10:${p}`] });
    const port = await relay.listen(0, '127.0.0.1');
    const env = buildEnv(port);
    const host = env.RelayHost.getInstance();
    host.setup();
    env.handlers['state.playing']();                       // comença la partida
    await until(() => relay.hostConnected);
    await until(() => env.pillEl.textContent.includes('424242'));   // el relé envia «hello» amb el PIN
    assert.ok(env.pillEl.textContent.includes('http://192.168.1.10:'), env.pillEl.textContent);

    const v = await connect(port, { role: 'viewer', origin: `http://127.0.0.1:${port}` });
    v.sendJson({ type: 'join', pin: '424242', name: 'Tauleta' });
    assert.equal((await v.json('joined')).id, 1);

    // El host crea la connexió WebRTC amb vídeo+àudio i envia l'oferta (amb el candidat mDNS reescrit)
    const offer = await v.json('signal');
    assert.equal(offer.data.type, 'offer');
    assert.ok(/ 127\.0\.0\.1 5000 /.test(offer.data.sdp), offer.data.sdp);
    const pc = env.pcs[0];
    assert.equal(pc.tracks.length, 2);

    // L'espectador respon i envia un candidat
    v.sendJson({ type: 'signal', data: { type: 'answer', sdp: 'v=0\r\n' } });
    await until(() => pc.calls.some(c => c[0] === 'remote'));
    v.sendJson({ type: 'signal', data: { candidate: 'candidate:9 1 udp 1 10.0.0.9 6000 typ host', sdpMid: '0', sdpMLineIndex: 0 } });
    await until(() => pc.calls.some(c => c[0] === 'ice'));

    // Quan connecta, es fixa la taxa de bits
    pc.connectionState = 'connected'; pc.fire('connectionstatechange');
    await until(() => pc.params);
    assert.equal(pc.params.encodings[0].maxBitrate, 10_000_000);

    // Entrada del mando de l'espectador: A premut + palanca esquerra a la dreta
    v.sendBinary(frame({ 0: 255 }, [1, 0, 0, 0]));
    await until(() => env.adapter.remotes.size === 1);
    const pads = navigator.getGamepads();
    assert.equal(pads[0].connected, true);
    assert.equal(pads[0].buttons[0].pressed, true);
    assert.ok(pads[0].axes[0] > 0.99);
    assert.equal(pads[0].mapping, 'standard');

    // L'espectador marxa: tot queda en repòs i la ranura s'allibera
    v.socket.destroy();
    await until(() => env.adapter.remotes.size === 0);
    assert.equal(navigator.getGamepads()[0], null);
    assert.equal(pc.closed, true);

    env.handlers['state.stopped']();
    await relay.close();
});

test('mode un jugador per espectador: ranures i esdeveniments de connexió', async () => {
    const relay = createRelay({ pin: '111111' });
    const port = await relay.listen(0, '127.0.0.1');
    const env = buildEnv(port, { 'relay.viewerMode': 'players' });
    env.RelayHost.getInstance().setup();
    env.handlers['state.playing']();
    await until(() => relay.hostConnected);

    const origin = `http://127.0.0.1:${port}`;
    const mk = async name => { const c = await connect(port, { role: 'viewer', origin }); c.sendJson({ type: 'join', pin: '111111', name }); await c.json('joined'); return c; };
    const a = await mk('A'), b = await mk('B');
    a.sendBinary(frame({ 1: 255 }));      // B premut
    b.sendBinary(frame({ 2: 255 }));      // X premut
    await until(() => env.adapter.remotes.size === 2);

    const pads = navigator.getGamepads();
    // La ranura 0 és de l'amfitrió: els espectadors són els jugadors 2 i 3
    assert.equal(pads[0], null);
    assert.equal(pads[1].id.endsWith('Remote 1'), true);
    assert.equal(pads[2].id.endsWith('Remote 2'), true);
    assert.equal(pads[1].buttons[1].pressed, true);
    assert.equal(pads[2].buttons[2].pressed, true);
    assert.deepEqual(env.events.filter(e => e[0] === 'gamepadconnected').map(e => [e[1].slice(-8), e[2]]), [['Remote 1', 1], ['Remote 2', 2]]);

    a.socket.destroy();
    await until(() => env.adapter.remotes.size === 1);
    assert.ok(env.events.some(e => e[0] === 'gamepaddisconnected' && e[1].endsWith('Remote 1')));

    env.handlers['state.stopped']();
    await relay.close();
});

test('si el relé no existeix, avisa un sol cop i reintenta', async () => {
    const env = buildEnv(1);   // port 1: ningú escolta
    env.RelayHost.getInstance().setup();
    env.handlers['state.playing']();
    await sleep(300);
    assert.equal(env.toasts.filter(t => String(t[0]).includes('relay-unavailable')).length, 1);
    env.handlers['state.stopped']();
});

test('quan no hi ha espectadors no es toca la llista de mandos', async () => {
    const env = buildEnv(1, { 'relay.enabled': false });
    assert.deepEqual(navigator.getGamepads(), [null, null, null, null]);
    env.handlers['state.playing']?.();
});

// ---------------------------------------------------------------- Casos reals que han fallat

test('àudio: s\'envia la pista processada per WebAudio (no la remota directa) i el vídeo és el de la consola', async () => {
    const relay = createRelay({ pin: '222222', discoveryPort: null });
    const port = await relay.listen(0, '127.0.0.1');
    const env = buildEnv(port);
    env.RelayHost.getInstance().setup();
    env.handlers['state.playing']();
    await until(() => relay.hostConnected);

    const v = await connect(port, { role: 'viewer', origin: `http://127.0.0.1:${port}` });
    v.sendJson({ type: 'join', pin: '222222' });
    await v.json('joined');
    const offer = await v.json('signal');
    assert.ok(offer.data.sid, 'l\'oferta porta un identificador de sessió');

    const pc = env.pcs[0];
    assert.deepEqual(pc.tracks.map(t => t.id), ['v-orig', 'processed']);
    assert.equal(env.audioInfo.sinkMuted, true, 'el <audio> auxiliar està mut');

    env.handlers['state.stopped']();
    assert.equal(env.audioInfo.closed, true, 'en aturar, es tanca l\'AudioContext');
    await relay.close();
});

test('mando virtual/remot: l\'esdeveniment "gamepadconnected" surt de seguida, sense esperar cap sondeig', async () => {
    const relay = createRelay({ pin: '333333', discoveryPort: null });
    const port = await relay.listen(0, '127.0.0.1');
    const env = buildEnv(port, { 'relay.viewerMode': 'shared' });
    env.RelayHost.getInstance().setup();
    env.handlers['state.playing']();
    await until(() => relay.hostConnected);

    const v = await connect(port, { role: 'viewer', origin: `http://127.0.0.1:${port}` });
    v.sendJson({ type: 'join', pin: '333333' });
    await v.json('joined');
    v.sendBinary(frame({ 0: 255 }));

    // Important: NO es crida navigator.getGamepads(); xCloud no sondeja fins que veu un mando connectat
    await until(() => env.events.some(e => e[0] === 'gamepadconnected'));
    assert.ok(env.events[0][1].includes('xCloud Català Pad'));

    // Quan l'espectador marxa, el mando es desconnecta
    v.socket.destroy();
    await until(() => env.events.some(e => e[0] === 'gamepaddisconnected'));
    env.handlers['state.stopped']();
    await relay.close();
});

test('mode jugadors: s\'habilita el cooperatiu local abans de connectar i es restaura en marxar', async () => {
    const relay = createRelay({ pin: '444444', discoveryPort: null });
    const port = await relay.listen(0, '127.0.0.1');
    const env = buildEnv(port, { 'relay.viewerMode': 'players' });
    env.RelayHost.getInstance().setup();
    env.handlers['state.playing']();
    await until(() => relay.hostConnected);

    const v = await connect(port, { role: 'viewer', origin: `http://127.0.0.1:${port}` });
    v.sendJson({ type: 'join', pin: '444444' });
    await v.json('joined');
    v.sendBinary(frame({ 0: 255 }));
    await until(() => env.events.some(e => e[0] === 'gamepadconnected'));

    assert.deepEqual(env.coopCalls, [true], 'primer s\'activa el cooperatiu');
    assert.equal(env.events[0][2], 1, 'primer espectador = jugador 2 (ranura 1): la 0 és de l\'amfitrió');

    v.socket.destroy();
    await until(() => env.adapter.remotes.size === 0);
    assert.deepEqual(env.coopCalls, [true, false], 'en marxar el darrer, es torna al valor de l\'usuari');
    env.handlers['state.stopped']();
    await relay.close();
});

test('aprovació des de la pantalla de l\'amfitrió; "Permet sempre" recorda el dispositiu', async () => {
    const relay = createRelay({ discoveryPort: null });
    const port = await relay.listen(0, '127.0.0.1');
    const env = buildEnv(port);
    const host = env.RelayHost.getInstance();
    const asked = [];
    host.askApproval = async req => { asked.push(req); return 'always'; };
    host.setup();
    env.handlers['state.playing']();
    await until(() => relay.hostConnected);

    const origin = `http://127.0.0.1:${port}`;
    const a = await connect(port, { role: 'viewer', origin });
    a.sendJson({ type: 'join', name: 'Tauleta', deviceId: 'dev-A' });
    assert.equal((await a.json('joined')).id, 1);
    assert.deepEqual([asked.length, asked[0].name, asked[0].deviceId], [1, 'Tauleta', 'dev-A']);

    // Segona vegada amb el mateix dispositiu: entra sense preguntar
    a.socket.destroy();
    await until(() => relay.viewerCount === 0);
    const b = await connect(port, { role: 'viewer', origin });
    b.sendJson({ type: 'join', name: 'Tauleta', deviceId: 'dev-A' });
    assert.equal((await b.json('joined')).id, 1);
    assert.equal(asked.length, 1, 'no s\'ha tornat a preguntar');

    // Dispositiu desconegut: sí que pregunta
    const c = await connect(port, { role: 'viewer', origin });
    c.sendJson({ type: 'join', name: 'Mòbil', deviceId: 'dev-B' });
    await c.json('joined');
    assert.equal(asked.length, 2);

    env.handlers['state.stopped']();
    await relay.close();
});

test('si cau la senyalització, la connexió WebRTC sana es conserva (no es perd la imatge)', async () => {
    const relay = createRelay({ pin: '555555', discoveryPort: null });
    const port = await relay.listen(0, '127.0.0.1');
    const env = buildEnv(port);
    const host = env.RelayHost.getInstance();
    host.setup();
    env.handlers['state.playing']();
    await until(() => relay.hostConnected);

    const v = await connect(port, { role: 'viewer', origin: `http://127.0.0.1:${port}` });
    v.sendJson({ type: 'join', pin: '555555' });
    await v.json('joined');
    await v.json('signal');
    assert.equal(env.pcs.length, 1);
    env.pcs[0].connectionState = 'connected';           // el vídeo ja arriba a l'espectador

    // Cau només la connexió amb el relé (el WebRTC és directe)
    host.ws.close();
    await v.json('host-offline');
    await until(() => relay.hostConnected, 7000);       // reconnecta sol als 4 s
    await v.json('host-online');
    await sleep(100);

    assert.equal(env.pcs.length, 1, 'no s\'ha creat una connexió nova');
    assert.equal(env.pcs[0].closed, undefined, 'la connexió antiga segueix oberta');
    env.handlers['state.stopped']();
    await relay.close();
});

test('mando digital en pantalla: també es connecta de seguida, i no si ja hi ha un mando físic', async () => {
    const env = buildEnv(1, { 'relay.enabled': false });
    env.adapter.setVirtualActive(true);
    assert.deepEqual(env.events.map(e => e[0]), ['gamepadconnected']);
    env.adapter.setVirtualActive(false);
    assert.deepEqual(env.events.map(e => e[0]), ['gamepadconnected', 'gamepaddisconnected']);

    // Amb un mando físic estàndard ja connectat, es fusiona (no es crea un mando nou)
    const physical = { id: 'Xbox (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 1, axes: [0, 0, 0, 0], buttons: new Array(17).fill(null).map(() => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [physical, null, null, null];
    env.adapter.nativeGetGamepads = () => [physical, null, null, null];
    env.events.length = 0;
    env.adapter.setVirtualActive(true);
    assert.deepEqual(env.events, []);
    env.adapter.virtual.buttons[0] = 1;
    assert.equal(env.adapter.patchedGetGamepads()[0].buttons[0].pressed, true);
});

// ---------------------------------------------------------------- Ranures: l'amfitrió és sempre el jugador 1

const connectedRemotes = () => navigator.getGamepads().filter(g => g?.connected && g.id.includes('Remote'));
const idle = new Array(17).fill(0), noAxes = [0, 0, 0, 0];

test('mode jugadors: els espectadors són els jugadors 2, 3 i 4; la ranura 0 és de l\'amfitrió (mando digital)', async () => {
    const env = buildEnv(1, { 'relay.enabled': false, 'relay.viewerMode': 'players' });
    env.adapter.setVirtualActive(true);                          // l'amfitrió juga amb el mando digital (ranura 0)
    env.adapter.virtual.buttons[0] = 1;

    env.adapter.setRemoteInput(1, idle, noAxes);
    env.adapter.setRemoteInput(2, idle, noAxes);
    env.adapter.setRemoteInput(3, idle, noAxes);

    const pads = navigator.getGamepads();
    assert.equal(pads[0].id, 'xCloud Català Pad', 'la ranura 0 segueix sent el mando de l\'amfitrió');
    assert.equal(pads[0].buttons[0].pressed, true, 'i no ha perdut els seus botons');
    assert.deepEqual([1, 2, 3].map(i => pads[i].id.slice(-8)), ['Remote 1', 'Remote 2', 'Remote 3']);
    assert.deepEqual([1, 2, 3].map(i => pads[i].index), [1, 2, 3]);
    assert.deepEqual(env.events.filter(e => e[0] === 'gamepadconnected' && e[1].includes('Remote')).map(e => e[2]), [1, 2, 3]);
});

test('mode jugadors: amb un mando físic a la ranura 0, l\'espectador no el trepitja', async () => {
    const env = buildEnv(1, { 'relay.enabled': false, 'relay.viewerMode': 'players' });
    const physical = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 5,
        axes: [0, 0, 0, 0], buttons: new Array(17).fill(null).map(() => ({ pressed: false, touched: false, value: 0 })) };
    physical.buttons[1] = { pressed: true, touched: true, value: 1 };
    env.adapter.nativeGetGamepads = () => [physical, null, null, null];
    navigator.getGamepads = env.adapter.patchedGetGamepads;

    env.adapter.setRemoteInput(1, idle, noAxes);
    const pads = navigator.getGamepads();
    assert.equal(pads[0], physical, 'el mando físic és exactament el mateix objecte');
    assert.equal(pads[1].id.endsWith('Remote 1'), true);
});

test('mode jugadors: sense cap mando a l\'amfitrió, el primer espectador és el jugador 2 (no el 1)', async () => {
    const env = buildEnv(1, { 'relay.enabled': false, 'relay.viewerMode': 'players' });
    env.adapter.setRemoteInput(1, idle, noAxes);
    const pads = navigator.getGamepads();
    assert.equal(pads[0], null);
    assert.equal(pads[1].index, 1);
});

test('mode jugadors: si un mando físic ocupa la ranura d\'un espectador, aquest es mou sense tocar la 0', async () => {
    const env = buildEnv(1, { 'relay.enabled': false, 'relay.viewerMode': 'players' });
    env.adapter.setRemoteInput(1, idle, noAxes);                 // ranura 1
    assert.equal(navigator.getGamepads()[1].id.endsWith('Remote 1'), true);

    const physical = { id: 'Pad físic', index: 1, connected: true, mapping: 'standard', timestamp: 1,
        axes: [0, 0, 0, 0], buttons: new Array(17).fill(null).map(() => ({ pressed: false, touched: false, value: 0 })) };
    env.adapter.nativeGetGamepads = () => [null, physical, null, null];

    const pads = navigator.getGamepads();
    assert.equal(pads[1], physical);
    assert.equal(pads[2].id.endsWith('Remote 1'), true, 'l\'espectador passa a la ranura 2');
    assert.equal(pads[0], null);
});

test('reentrada: es neteja l\'estat antic i no queda cap mando repetit', async () => {
    const env = buildEnv(1, { 'relay.enabled': false, 'relay.viewerMode': 'players' });
    env.adapter.setVirtualActive(true);
    env.adapter.setRemoteInput(1, idle, noAxes);
    env.adapter.setRemoteInput(2, idle, noAxes);
    assert.equal(connectedRemotes().length, 2);

    env.events.length = 0;
    env.adapter.removeRemote(1);                                 // l'espectador 1 marxa
    assert.deepEqual(env.events.map(e => e[0]), ['gamepaddisconnected']);
    assert.equal(connectedRemotes().length, 1);

    env.events.length = 0;
    env.adapter.setRemoteInput(1, idle, noAxes);                 // i torna a entrar
    assert.deepEqual(env.events.map(e => [e[0], e[2]]), [['gamepadconnected', 1]], 'una sola connexió, a la ranura 1');
    const remotes = connectedRemotes();
    assert.equal(remotes.length, 2, 'exactament 2 espectadors, sense duplicats');
    assert.equal(new Set(remotes.map(g => g.id)).size, 2);
    assert.equal(navigator.getGamepads()[0].id, 'xCloud Català Pad', 'l\'amfitrió intacte');
});

test('espectador que torna a entrar des del mateix dispositiu: un sol mando virtual, i l\'amfitrió no el perd', async () => {
    const relay = createRelay({ pin: '777777', discoveryPort: null });
    const port = await relay.listen(0, '127.0.0.1');
    const env = buildEnv(port, { 'relay.viewerMode': 'players' });
    env.adapter.setVirtualActive(true);                          // amfitrió amb mando digital
    env.RelayHost.getInstance().setup();
    env.handlers['state.playing']();
    await until(() => relay.hostConnected);

    const origin = `http://127.0.0.1:${port}`;
    const join = async () => {
        const v = await connect(port, { role: 'viewer', origin });
        v.sendJson({ type: 'join', pin: '777777', name: 'Mòbil', deviceId: 'dev-1' });
        await v.json('joined');
        v.sendBinary(frame({ 0: 255 }));
        return v;
    };

    const first = await join();
    await until(() => connectedRemotes().length === 1);

    // El primer es "congela" (sense tancar res) i el mateix dispositiu torna a entrar
    const second = await join();
    await until(() => env.events.some(e => e[0] === 'gamepaddisconnected' && e[1].includes('Remote')));
    await until(() => connectedRemotes().length === 1);
    await sleep(100);

    const remotes = connectedRemotes();
    assert.equal(remotes.length, 1, 'un sol mando remot, no dos');
    assert.equal(remotes[0].index, 1);
    assert.equal(env.adapter.remotes.size, 1);
    assert.equal(env.pcs.filter(p => !p.closed).length, 1, 'una sola connexió WebRTC activa');
    assert.equal(navigator.getGamepads()[0].id, 'xCloud Català Pad');

    env.handlers['state.stopped']();
    await relay.close();
});
