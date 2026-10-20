import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRelay, rewriteMdns, INPUT_FRAME_SIZE } from '../relay.mjs';
import { encodeFrame, FrameParser, OP } from '../ws-lite.mjs';
import { connect, openSockets } from './helpers.mjs';

const XBOX = 'https://www.xbox.com';
afterEach(() => { for (const s of openSockets) s.destroy(); openSockets.clear(); });

async function setup(opts = {}) {
    const relay = createRelay({ pin: '123456', discoveryPort: null, urlsProvider: p => [`http://192.168.1.10:${p}`], viewerHtml: '<b>viewer</b>', ...opts });
    const port = await relay.listen(0, '127.0.0.1');
    return { relay, port };
}

const input = (b0 = 0) => { const f = Buffer.alloc(INPUT_FRAME_SIZE); f[0] = 1; f[1] = b0; return f; };

test('el host només s\'accepta amb origen d\'xCloud', async () => {
    const { relay, port } = await setup();
    assert.equal((await connect(port, { role: 'host' })).status(), 403);
    assert.equal((await connect(port, { role: 'host', origin: 'https://evil.example' })).status(), 403);
    const host = await connect(port, { role: 'host', origin: XBOX });
    assert.equal(host.status(), 101);
    const hello = await host.json('hello');
    assert.equal(hello.pin, '123456');
    assert.deepEqual(hello.urls, [`http://192.168.1.10:${port}`]);
    await relay.close();
});

test('els espectadors han de venir del mateix origen (anti-CSWSH)', async () => {
    const { relay, port } = await setup();
    assert.equal((await connect(port, { role: 'viewer', origin: 'https://evil.example' })).status(), 403);
    assert.equal((await connect(port, { role: 'viewer' })).status(), 403);
    assert.equal((await connect(port, { role: 'viewer', origin: `http://127.0.0.1:${port}` })).status(), 101);
    await relay.close();
});

test('PIN incorrecte, bloqueig després de 5 errors', async () => {
    const { relay, port } = await setup({ maxFailures: 3 });
    const origin = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 3; i++) {
        const v = await connect(port, { role: 'viewer', origin });
        v.sendJson({ type: 'join', pin: '000000' });
        assert.equal((await v.json('error')).reason, 'pin');
    }
    const v = await connect(port, { role: 'viewer', origin });
    v.sendJson({ type: 'join', pin: '123456' }); // encara que sigui correcte, està bloquejat
    assert.equal((await v.json('error')).reason, 'locked');
    await relay.close();
});

test('flux complet: unió, senyalització, entrada, sortida', async () => {
    const { relay, port } = await setup();
    const origin = `http://127.0.0.1:${port}`;
    const host = await connect(port, { role: 'host', origin: XBOX });
    await host.json('hello');

    const v = await connect(port, { role: 'viewer', origin });
    v.sendJson({ type: 'join', pin: '123456', name: 'Mòbil' });
    const joined = await v.json('joined');
    assert.equal(joined.id, 1);
    assert.equal(joined.hostOnline, true);
    const vj = await host.json('viewer-joined');
    assert.deepEqual([vj.id, vj.name], [1, 'Mòbil']);

    // Senyalització amb candidats mDNS: es tradueixen a IP real
    const mdns = '3b7d0a1c-1111-4222-8333-444455556666.local';
    v.sendJson({ type: 'signal', data: { candidate: `candidate:1 1 udp 2113937151 ${mdns} 5000 typ host`, sdpMid: '0' } });
    const fromViewer = await host.json('signal');
    assert.equal(fromViewer.from, 1);
    assert.ok(fromViewer.data.candidate.includes(' 127.0.0.1 5000 '), fromViewer.data.candidate);

    host.sendJson({ type: 'signal', to: 1, data: { sdp: `a=candidate:2 1 udp 1 ${mdns} 6000 typ host\r\n`, type: 'offer' } });
    const toViewer = await v.json('signal');
    assert.ok(toViewer.data.sdp.includes(' 127.0.0.1 6000 '), toViewer.data.sdp);

    // Entrada del mando: es reenvia amb l'id de l'espectador al davant
    v.sendBinary(input(7));
    const bin = await host.next(m => m.opcode === OP.BINARY);
    assert.equal(bin.payload.length, INPUT_FRAME_SIZE + 1);
    assert.equal(bin.payload[0], 1);
    assert.equal(bin.payload[1], 1);
    assert.equal(bin.payload[2], 7);

    // Fotogrames de mida incorrecta es descarten
    v.sendBinary(Buffer.alloc(10));
    await assert.rejects(host.next(m => m.opcode === OP.BINARY, 300));

    // El host expulsa l'espectador
    host.sendJson({ type: 'kick', id: 1 });
    assert.equal((await v.json('error')).reason, 'kicked');
    assert.equal((await host.json('viewer-left')).id, 1);
    await relay.close();
});

test('límit d\'espectadors i reassignació d\'identificadors', async () => {
    const { relay, port } = await setup({ maxViewers: 2 });
    const origin = `http://127.0.0.1:${port}`;
    const join = async () => { const v = await connect(port, { role: 'viewer', origin }); v.sendJson({ type: 'join', pin: '123456' }); return v; };
    const a = await join(); assert.equal((await a.json('joined')).id, 1);
    const b = await join(); assert.equal((await b.json('joined')).id, 2);
    const c = await join(); assert.equal((await c.json('error')).reason, 'full');
    a.socket.destroy();
    await new Promise(r => setTimeout(r, 100));
    const d = await join(); assert.equal((await d.json('joined')).id, 1);
    await relay.close();
});

test('el host cau i torna: els espectadors esperen i es reenganxen', async () => {
    const { relay, port } = await setup();
    const origin = `http://127.0.0.1:${port}`;
    const host1 = await connect(port, { role: 'host', origin: XBOX });
    await host1.json('hello');
    const v = await connect(port, { role: 'viewer', origin });
    v.sendJson({ type: 'join', pin: '123456' });
    await v.json('joined');
    await host1.json('viewer-joined');

    host1.socket.destroy();
    await v.json('host-offline');

    const host2 = await connect(port, { role: 'host', origin: XBOX });
    const hello = await host2.json('hello');
    assert.equal(hello.viewers.length, 1);
    assert.equal((await host2.json('viewer-joined')).id, 1);
    await v.json('host-online');
    await relay.close();
});

test('un segon host substitueix el primer', async () => {
    const { relay, port } = await setup();
    const h1 = await connect(port, { role: 'host', origin: XBOX });
    await h1.json('hello');
    const h2 = await connect(port, { role: 'host', origin: XBOX });
    await h2.json('hello');
    await h1.closed;
    assert.equal(relay.hostConnected, true);
    await relay.close();
});

test('HTTP: serveix la pàgina d\'espectador amb capçaleres de seguretat', async () => {
    const { relay, port } = await setup();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(await res.text(), '<b>viewer</b>');
    assert.equal((await fetch(`http://127.0.0.1:${port}/secret`)).status, 404);
    await relay.close();
});

test('rewriteMdns només toca sdp i candidate', () => {
    const m = '3b7d0a1c-1111-4222-8333-444455556666.local';
    const out = rewriteMdns({ sdp: `x ${m}`, candidate: `y ${m}`, other: `z ${m}`, nested: { candidate: m } }, '10.0.0.5');
    assert.equal(out.sdp, 'x 10.0.0.5');
    assert.equal(out.candidate, 'y 10.0.0.5');
    assert.equal(out.other, `z ${m}`);
    assert.equal(out.nested.candidate, '10.0.0.5');
});

test('FrameParser: fragments, mides llargues i protocol', () => {
    const p = new FrameParser({ requireMask: true });
    const big = Buffer.alloc(70000, 7);
    const parserBig = new FrameParser({ requireMask: true, maxPayload: 100000 });
    const msgs = parserBig.push(encodeFrame(OP.BINARY, big, true));
    assert.equal(msgs[0].payload.length, 70000);

    // Dos trossos d'un mateix fotograma
    const f = encodeFrame(OP.TEXT, Buffer.from('hola'), true);
    assert.equal(p.push(f.subarray(0, 3)).length, 0);
    assert.equal(p.push(f.subarray(3))[0].payload.toString(), 'hola');

    // Fotograma sense màscara del client: error
    assert.throws(() => new FrameParser({ requireMask: true }).push(encodeFrame(OP.TEXT, Buffer.from('x'), false)));
    // Massa gran
    assert.throws(() => new FrameParser({ maxPayload: 10 }).push(encodeFrame(OP.TEXT, Buffer.alloc(11), true)));
});

// ---------------------------------------------------------------- Novetats: pings, aprovació, detecció

test('l\'amfitrió no es desconnecta per inactivitat si respon als pings (com un navegador)', async () => {
    const { relay, port } = await setup({ sweepMs: 50, idleTimeoutMs: 250 });
    const host = await connect(port, { role: 'host', origin: XBOX });
    await host.json('hello');
    await new Promise(r => setTimeout(r, 700));     // molt més que el temps d'espera
    assert.equal(relay.hostConnected, true);
    await relay.close();
});

test('una connexió que no respon als pings es tanca', async () => {
    const { relay, port } = await setup({ sweepMs: 50, idleTimeoutMs: 250 });
    const host = await connect(port, { role: 'host', origin: XBOX, autoPong: false });
    await host.json('hello');
    await until(() => !relay.hostConnected, 1500);
    await relay.close();
});

async function until(fn, ms = 1500) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return; await new Promise(r => setTimeout(r, 10)); } throw new Error('until: timeout'); }

test('sense PIN: l\'amfitrió aprova i l\'espectador entra', async () => {
    const { relay, port } = await setup();
    const origin = `http://127.0.0.1:${port}`;
    const host = await connect(port, { role: 'host', origin: XBOX });
    await host.json('hello');

    const v = await connect(port, { role: 'viewer', origin });
    v.sendJson({ type: 'join', name: 'Mòbil', deviceId: 'dev-1' });
    await v.json('waiting');
    const req = await host.json('join-request');
    assert.deepEqual([req.name, req.deviceId, req.ip], ['Mòbil', 'dev-1', '127.0.0.1']);

    host.sendJson({ type: 'approve', rid: req.rid });
    assert.equal((await v.json('joined')).id, 1);
    assert.equal((await host.json('viewer-joined')).name, 'Mòbil');
    await relay.close();
});

test('sense PIN: l\'amfitrió rebutja, o no contesta, o no hi ha amfitrió', async () => {
    const { relay, port } = await setup({ approvalTimeoutMs: 200 });
    const origin = `http://127.0.0.1:${port}`;

    // Sense amfitrió
    const lonely = await connect(port, { role: 'viewer', origin });
    lonely.sendJson({ type: 'join', name: 'x' });
    assert.equal((await lonely.json('error')).reason, 'no-host');

    const host = await connect(port, { role: 'host', origin: XBOX });
    await host.json('hello');

    // Rebutjat
    const a = await connect(port, { role: 'viewer', origin });
    a.sendJson({ type: 'join', name: 'a' });
    const req = await host.json('join-request');
    host.sendJson({ type: 'deny', rid: req.rid });
    assert.equal((await a.json('error')).reason, 'denied');

    // Sense resposta: caduca
    const b = await connect(port, { role: 'viewer', origin });
    b.sendJson({ type: 'join', name: 'b' });
    await host.json('join-request');
    assert.equal((await b.json('error')).reason, 'timeout');
    assert.equal(relay.viewerCount, 0);
    await relay.close();
});

test('sense PIN: límit de sol·licituds pendents per IP', async () => {
    const { relay, port } = await setup({ maxPendingPerIp: 2 });
    const origin = `http://127.0.0.1:${port}`;
    const host = await connect(port, { role: 'host', origin: XBOX });
    await host.json('hello');
    const mk = async () => { const v = await connect(port, { role: 'viewer', origin }); v.sendJson({ type: 'join', name: 'n' }); return v; };
    await mk(); await mk();
    const third = await mk();
    assert.equal((await third.json('error')).reason, 'busy');
    await relay.close();
});

test('un viewer de l\'app d\'Android (origen intern) s\'accepta; un altre origen https no', async () => {
    const { relay, port } = await setup();
    assert.equal((await connect(port, { role: 'viewer', origin: 'https://appassets.androidplatform.net', hostHeader: `192.168.1.5:${port}` })).status(), 101);
    assert.equal((await connect(port, { role: 'viewer', origin: 'https://example.com', hostHeader: `192.168.1.5:${port}` })).status(), 403);
    await relay.close();
});

test('detecció UDP: respon a XCC-DISCOVER amb nom i port', async () => {
    const dgram = await import('node:dgram');
    const relay = createRelay({ pin: '123456', discoveryPort: 0, name: 'PC-Sala' });
    const port = await relay.listen(0, '127.0.0.1');
    const udpPort = await new Promise(async res => { for (let i = 0; i < 50; i++) { if (relay.discoveryPort) return res(relay.discoveryPort); await new Promise(r => setTimeout(r, 20)); } res(null); });
    assert.ok(udpPort, 'el socket UDP ha de tenir port');

    const client = dgram.createSocket('udp4');
    const reply = await new Promise((resolve, reject) => {
        client.on('message', m => resolve(JSON.parse(m.toString())));
        client.send('XCC-DISCOVER', udpPort, '127.0.0.1');
        setTimeout(() => reject(new Error('sense resposta')), 1500);
    });
    client.close();
    assert.deepEqual([reply.app, reply.name, reply.port, reply.hostOnline], ['xcloud-catala', 'PC-Sala', port, false]);
    await relay.close();
});
