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
    class MockStream {}

    const source = { getReceivers: () => [{ track: { kind: 'video', readyState: 'live' } }, { track: { kind: 'audio', readyState: 'live' } }] };
    const pillEl = { classList: { remove() {}, add() {} }, remove() { pillEl.removed = true; }, textContent: '' };

    const win = { setTimeout, clearTimeout, performance, navigator: { getGamepads: () => [null, null, null, null] }, localStorage: { getItem: () => null, setItem() {} } };
    class XboxOriginWebSocket extends WebSocket {
        constructor(url) { super(url, { headers: { Origin: 'https://www.xbox.com' } }); }
    }
    Object.assign(globalThis, { window: win, document: { documentElement: { appendChild() {} }, createElement() { return {}; } }, RTCPeerConnection: MockPC, MediaStream: MockStream });
    Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true, writable: true });
    win.WebSocket = XboxOriginWebSocket;
    globalThis.WebSocket = XboxOriginWebSocket;

    const stubs = {
        '@/enums/pref-keys': { GlobalPref: new Proxy({}, { get: (_, k) => ({
            RELAY_ENABLED: 'relay.enabled', RELAY_PORT: 'relay.port', RELAY_VIEWER_MODE: 'relay.viewerMode', RELAY_BITRATE: 'relay.bitrate',
            GAMEPAD_ADAPTER_ENABLED: 'gamepadAdapter.enabled', GAMEPAD_ADAPTER_SWAP_FACE: 'gamepadAdapter.swapFace', GAMEPAD_ADAPTER_DEADZONE: 'gamepadAdapter.deadzone' }[k]) }),
            StorageKey: { GAMEPAD_PROFILES: 'p' } },
        '@utils/bx-event-bus': { BxEventBus: { Stream: { on: (e, f) => { handlers[e] = f; } } } },
        '@utils/bx-logger': { BxLogger: { info() {}, warning() {}, error(...a) { console.error('[ERR]', ...a); } } },
        '@utils/global': { AppInterface: null, STATES: { currentStream: { peerConnection: source } } },
        '@utils/html': { CE: () => pillEl },
        '@utils/pref-utils': { getGlobalPref: k => prefs[k] },
        '@utils/toast': { Toast: { show: (...a) => toasts.push(a) } },
        '@utils/translation': { t: (k, v) => k + (v ? ':' + JSON.stringify(v) : '') },
        '@utils/bx-event': { BxEvent: { dispatch: (_t, name, data) => events.push([name, data.gamepad.id, data.gamepad.index]) } },
    };

    const load = (file, name) => { const m = { exports: {} }; new Function('require', 'module', 'exports', transpile(file))(n => n === '@modules/gamepad-adapter' ? adapterMod : stubs[n], m, m.exports); return m.exports; };
    const adapterMod = load('gamepad-adapter.ts');
    const { RelayHost } = load('relay/relay-host.ts');
    const adapter = adapterMod.GamepadAdapter.getInstance();
    adapter.install();
    return { RelayHost, adapter, handlers, events, toasts, pcs, prefs, pillEl };
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
    assert.equal(pads[0].id.endsWith('Remote 1'), true);
    assert.equal(pads[1].id.endsWith('Remote 2'), true);
    assert.equal(pads[0].buttons[1].pressed, true);
    assert.equal(pads[1].buttons[2].pressed, true);
    assert.deepEqual(env.events.filter(e => e[0] === 'gamepadconnected').map(e => [e[1].slice(-8), e[2]]), [['Remote 1', 0], ['Remote 2', 1]]);

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
