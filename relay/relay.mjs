// Relé de xarxa local per compartir la partida amb altres dispositius.
//
//   bun relay/relay.mjs [--port 8787] [--pin 123456] [--max-viewers 3]
//   (o: node relay/relay.mjs)
//
// - L'script de xCloud (a xbox.com) es connecta com a "host" des del mateix PC.
// - Els altres dispositius obren http://<IP-del-PC>:<port>, escriuen el PIN i veuen la partida.
// Aquest servidor només fa de senyalització (WebRTC) i de pont d'entrada dels mandos; el vídeo
// va directament del PC als espectadors.
import http from 'node:http';
import dgram from 'node:dgram';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { acceptKey, encodeFrame, FrameParser, OP } from './ws-lite.mjs';

const MDNS = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.local\b/gi;
export const INPUT_FRAME_SIZE = 26; // [tipus=1][17 botons u8][4 eixos i16 BE]

const stripV6Mapped = ip => (ip || '').replace(/^::ffff:/i, '');
const isLoopback = ip => ['127.0.0.1', '::1'].includes(stripV6Mapped(ip));

/** Substitueix els noms mDNS (xxxx.local) dels candidats ICE per l'adreça IP real. */
export function rewriteMdns(value, ip, key = '') {
    if (typeof value === 'string') {
        return (key === 'sdp' || key === 'candidate') ? value.replace(MDNS, ip) : value;
    }
    if (Array.isArray(value)) return value.map(v => rewriteMdns(v, ip, key));
    if (value && typeof value === 'object') {
        const out = {};
        for (const k of Object.keys(value)) out[k] = rewriteMdns(value[k], ip, k);
        return out;
    }
    return value;
}

export function lanUrls(port) {
    const urls = [];
    for (const list of Object.values(os.networkInterfaces())) {
        for (const nic of list || []) {
            if (nic.family === 'IPv4' && !nic.internal) urls.push(`http://${nic.address}:${port}`);
        }
    }
    return urls;
}

export function createRelay(options = {}) {
    const {
        maxViewers = 3,
        pin = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0'),
        hostOrigins = ['https://www.xbox.com'],
        viewerHtml = '<h1>Espectador no disponible</h1>',
        log = () => {},
        urlsProvider = lanUrls,
        joinTimeoutMs = 5000,
        idleTimeoutMs = 45000,          // amfitrió (ping cada 5 s + marge)
        viewerIdleTimeoutMs = 30000,    // espectadors: 15 s era massa agressiu amb Wi-Fi irregular / pestanya en segon pla
        sweepMs = 5000,
        maxFailures = 5,
        lockMs = 60000,
        // L'app d'Android carrega la pàgina d'espectador des d'aquest origen intern (context segur -> mandos)
        extraViewerOrigins = ['https://appassets.androidplatform.net'],
        approvalTimeoutMs = 30000,
        maxPendingPerIp = 2,
        maxPending = 5,
        discoveryPort = 8788,      // UDP; 0 = ephemeral; null = desactivat
        name = os.hostname(),
    } = options;

    let host = null;                     // client del host
    const viewers = new Map();           // id -> client
    const failures = new Map();          // ip -> { count, until }
    let listenPort = 0;
    let udp = null;
    let nextRequestId = 1;
    let joinCounter = 0;     // identificador únic per cada unió (permet distingir una connexió nova d'una antiga)
    const pending = new Map();           // rid -> { client, timer }

    const server = http.createServer((req, res) => {
        const path = (req.url || '/').split('?')[0];
        const headers = {
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'X-Frame-Options': 'DENY',
        };

        if (path === '/' || path === '/index.html') {
            res.writeHead(200, {
                ...headers,
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src ws: wss:; media-src blob: mediastream:; img-src data:",
            });
            res.end(viewerHtml);
        } else if (path === '/health') {
            res.writeHead(200, { ...headers, 'Content-Type': 'text/plain' });
            res.end('ok');
        } else {
            res.writeHead(404, headers);
            res.end();
        }
    });

    // ---------------------------------------------------------------- Client WebSocket

    function makeClient(socket, role) {
        const client = {
            role, socket, id: 0, joined: false, name: '',
            ip: stripV6Mapped(socket.remoteAddress),
            localIp: stripV6Mapped(socket.localAddress),
            lastSeen: Date.now(),
            parser: new FrameParser({ maxPayload: 64 * 1024, requireMask: true }),
            closed: false,
            sendText(obj) { this.write(OP.TEXT, Buffer.from(JSON.stringify(obj))); },
            sendBinary(buf) { this.write(OP.BINARY, buf); },
            write(op, payload) {
                if (this.closed || socket.destroyed) return;
                try { socket.write(encodeFrame(op, payload)); } catch (e) { this.close(); }
            },
            close(code = 1000) {
                if (this.closed) return;
                this.closed = true;
                try {
                    const p = Buffer.alloc(2); p.writeUInt16BE(code);
                    socket.write(encodeFrame(OP.CLOSE, p));
                } catch (e) {}
                socket.end();
                setTimeout(() => socket.destroy(), 500).unref();
            },
        };
        return client;
    }

    function reject(socket, status, text) {
        socket.write(`HTTP/1.1 ${status} ${text}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
        socket.destroy();
    }

    server.on('upgrade', (req, socket) => {
        let url;
        try { url = new URL(req.url, 'http://x'); } catch (e) { return reject(socket, 400, 'Bad Request'); }

        const key = req.headers['sec-websocket-key'];
        if (url.pathname !== '/ws' || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket') {
            return reject(socket, 400, 'Bad Request');
        }

        const role = url.searchParams.get('role');
        const origin = req.headers.origin;

        if (role === 'host') {
            // Només des del mateix equip i només des de la pàgina d'xCloud
            if (!isLoopback(socket.remoteAddress) || !origin || !hostOrigins.includes(origin)) {
                log('Host rebutjat', socket.remoteAddress, origin);
                return reject(socket, 403, 'Forbidden');
            }
        } else if (role === 'viewer') {
            // Evita que una pàgina web aliena (altre origen) es connecti en nom de l'usuari
            let originHost = null;
            try { originHost = origin ? new URL(origin).host : null; } catch (e) {}
            const sameOrigin = !!originHost && originHost === req.headers.host;
            if (!sameOrigin && !extraViewerOrigins.includes(origin)) {
                return reject(socket, 403, 'Forbidden');
            }
        } else {
            return reject(socket, 400, 'Bad Request');
        }

        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`
        );
        socket.setNoDelay(true);

        const client = makeClient(socket, role);
        role === 'host' ? onHostConnected(client) : onViewerConnected(client);

        socket.on('data', chunk => {
            let messages;
            try { messages = client.parser.push(chunk); } catch (e) { return client.close(1002); }
            client.lastSeen = Date.now();

            for (const m of messages) {
                if (m.opcode === OP.CLOSE) return client.close();
                if (m.opcode === OP.PING) { client.write(OP.PONG, m.payload); continue; }
                if (m.opcode === OP.PONG) continue;

                if (m.opcode === OP.TEXT) {
                    let msg;
                    try { msg = JSON.parse(m.payload.toString('utf8')); } catch (e) { continue; }
                    if (msg && typeof msg === 'object') {
                        role === 'host' ? onHostMessage(client, msg) : onViewerMessage(client, msg);
                    }
                } else if (m.opcode === OP.BINARY && role === 'viewer') {
                    onViewerInput(client, m.payload);
                }
            }
        });

        const onGone = () => {
            if (client.gone) return;
            client.gone = true;
            client.closed = true;
            role === 'host' ? onHostGone(client) : onViewerGone(client);
        };
        // http.Server deixa els sòcols "half-open": cal tancar-los quan el client acaba (pestanya tancada)
        socket.on('end', () => socket.destroy());
        socket.on('close', onGone);
        socket.on('error', onGone);
    });

    // ---------------------------------------------------------------- Host

    function hello() {
        return {
            type: 'hello',
            name,
            pin,
            urls: urlsProvider(listenPort),
            maxViewers,
            viewers: [...viewers.values()].filter(v => v.joined).map(v => ({ id: v.id, name: v.name, vsid: v.vsid })),
        };
    }

    function onHostConnected(client) {
        if (host) host.close(4000); // només un host alhora
        host = client;
        log('Host connectat');

        client.sendText(hello());
        for (const v of viewers.values()) {
            if (v.joined) {
                client.sendText({ type: 'viewer-joined', id: v.id, name: v.name, vsid: v.vsid });
                v.sendText({ type: 'host-online' });
            }
        }
    }

    function onHostGone(client) {
        if (host !== client) return;
        host = null;
        log('Host desconnectat');
        for (const v of viewers.values()) v.joined && v.sendText({ type: 'host-offline' });
    }

    function onHostMessage(client, msg) {
        if (msg.type === 'signal') {
            const v = viewers.get(msg.to);
            // Els candidats del host s'adrecen amb la IP per la qual el vídeo arriba a l'espectador
            v?.joined && v.sendText({ type: 'signal', data: rewriteMdns(msg.data, v.localIp) });
        } else if (msg.type === 'approve' || msg.type === 'deny') {
            const entry = pending.get(msg.rid);
            if (!entry) return;
            pending.delete(msg.rid);
            clearTimeout(entry.timer);
            if (msg.type === 'approve') {
                admit(entry.client, entry.msg);
            } else {
                entry.client.sendText({ type: 'error', reason: 'denied' });
                entry.client.close(4006);
            }
        } else if (msg.type === 'kick') {
            const v = viewers.get(msg.id);
            v?.sendText({ type: 'error', reason: 'kicked' });
            v?.close(4003);
        }
    }

    // ---------------------------------------------------------------- Espectadors

    function isLocked(ip) {
        const f = failures.get(ip);
        return !!f && f.count >= maxFailures && Date.now() < f.until;
    }

    function onViewerConnected(client) {
        client.joinTimer = setTimeout(() => !client.joined && client.close(4002), joinTimeoutMs);
        client.joinTimer.unref?.();
    }

    /** Assigna identificador a l'espectador i l'incorpora a la sessió. */
    /** Un dispositiu només pot tenir una sessió: si torna a entrar, la sessió antiga (potser morta) se substitueix. */
    function replaceDuplicates(client, deviceId) {
        if (!deviceId) return;
        for (const old of [...viewers.values()]) {
            if (old !== client && old.joined && old.deviceId === deviceId) {
                viewers.delete(old.id);
                old.joined = false;                                   // així onViewerGone no avisa dues vegades
                host?.sendText({ type: 'viewer-left', id: old.id });  // l'amfitrió neteja connexió i mando virtual
                old.sendText({ type: 'error', reason: 'replaced' });
                old.close(4009);
                log('Espectador', old.id, 'substituït (mateix dispositiu)');
            }
        }
    }

    function admit(client, msg) {
        if (client.joined || client.closed) return;

        client.deviceId = String(msg.deviceId ?? '').slice(0, 64);
        replaceDuplicates(client, client.deviceId);

        let id = 0;
        for (let i = 1; i <= maxViewers; i++) if (!viewers.has(i)) { id = i; break; }
        if (!id) {
            client.sendText({ type: 'error', reason: 'full' });
            return client.close(4004);
        }

        clearTimeout(client.joinTimer);
        client.id = id;
        client.vsid = ++joinCounter;
        client.joined = true;
        client.name = String(msg.name ?? '').slice(0, 24);
        viewers.set(id, client);

        log('Espectador', id, client.ip);
        client.sendText({ type: 'joined', id, hostOnline: !!host });
        host?.sendText({ type: 'viewer-joined', id, name: client.name, vsid: client.vsid });
    }

    function removePending(client) {
        for (const [rid, entry] of pending) {
            if (entry.client === client) { clearTimeout(entry.timer); pending.delete(rid); }
        }
    }

    function onViewerMessage(client, msg) {
        if (msg.type === 'join') {
            if (client.joined || client.requesting) return;

            if (msg.pin === undefined || msg.pin === null || msg.pin === '') {
                return requestApproval(client, msg);
            }

            if (isLocked(client.ip)) {
                client.sendText({ type: 'error', reason: 'locked' });
                return client.close(4001);
            }

            const supplied = String(msg.pin);
            const a = Buffer.from(supplied.padEnd(32).slice(0, 32));
            const b = Buffer.from(pin.padEnd(32).slice(0, 32));
            if (supplied.length !== pin.length || !crypto.timingSafeEqual(a, b)) {
                const f = failures.get(client.ip) || { count: 0, until: 0 };
                f.count++;
                f.until = Date.now() + lockMs;
                failures.set(client.ip, f);
                client.sendText({ type: 'error', reason: 'pin' });
                return client.close(4001);
            }

            failures.delete(client.ip);
            admit(client, msg);
        } else if (msg.type === 'signal' && client.joined) {
            // Els candidats de l'espectador (mDNS) es tradueixen a la seva IP real
            host?.sendText({ type: 'signal', from: client.id, data: rewriteMdns(msg.data, client.ip) });
        }
    }

    /** Sense PIN: l'amfitrió (la persona davant la pantalla) ha d'aprovar l'espectador. */
    function requestApproval(client, msg) {
        if (!host) {
            client.sendText({ type: 'error', reason: 'no-host' });
            return client.close(4007);
        }

        const mine = [...pending.values()].filter(e => e.client.ip === client.ip).length;
        if (mine >= maxPendingPerIp || pending.size >= maxPending) {
            client.sendText({ type: 'error', reason: 'busy' });
            return client.close(4008);
        }

        const rid = nextRequestId++;
        client.requesting = true;
        clearTimeout(client.joinTimer);
        const timer = setTimeout(() => {
            pending.delete(rid);
            client.sendText({ type: 'error', reason: 'timeout' });
            client.close(4005);
        }, approvalTimeoutMs);
        timer.unref?.();
        pending.set(rid, { client, timer, msg });

        host.sendText({
            type: 'join-request', rid,
            name: String(msg.name ?? '').slice(0, 24),
            deviceId: String(msg.deviceId ?? '').slice(0, 64),
            ip: client.ip,
        });
        client.sendText({ type: 'waiting' });
    }

    function onViewerInput(client, payload) {
        if (!client.joined || !host || payload.length !== INPUT_FRAME_SIZE || payload[0] !== 1) return;
        host.sendBinary(Buffer.concat([Buffer.from([client.id]), payload]));
    }

    function onViewerGone(client) {
        clearTimeout(client.joinTimer);
        removePending(client);
        if (client.joined && viewers.get(client.id) === client) {
            viewers.delete(client.id);
            log('Espectador', client.id, 'desconnectat');
            host?.sendText({ type: 'viewer-left', id: client.id });
        }
    }

    // Cada `sweepMs`: tanca les connexions mortes i envia un ping a les vives. Els navegadors responen
    // sols amb un pong, de manera que l'amfitrió no es desconnecta encara que no enviï res.
    const sweeper = setInterval(() => {
        const now = Date.now();
        for (const c of [host, ...viewers.values()]) {
            if (!c) continue;
            const limit = c.role === 'host' ? idleTimeoutMs : viewerIdleTimeoutMs;
            if (now - c.lastSeen > limit) c.close(1001);
            else c.write(OP.PING, Buffer.alloc(0));
        }
    }, sweepMs);
    sweeper.unref();

    // ---------------------------------------------------------------- Detecció a la xarxa (UDP)
    function startDiscovery() {
        if (discoveryPort === null || discoveryPort === undefined) return;
        try {
            udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
            udp.on('error', () => { try { udp.close(); } catch (e) {} udp = null; });
            udp.on('message', (data, rinfo) => {
                if (!data.toString('utf8').startsWith('XCC-DISCOVER')) return;
                const reply = JSON.stringify({ app: 'xcloud-catala', v: 1, name, port: listenPort, hostOnline: !!host });
                udp?.send(reply, rinfo.port, rinfo.address);
            });
            udp.bind(discoveryPort);
        } catch (e) {
            udp = null; // sense detecció: es pot unir amb l'adreça escrita
        }
    }

    return {
        server,
        pin,
        listen(port = 8787, bindHost = '0.0.0.0') {
            return new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, bindHost, () => {
                    listenPort = server.address().port;
                    startDiscovery();
                    resolve(listenPort);
                });
            });
        },
        close() {
            clearInterval(sweeper);
            try { udp?.close(); } catch (e) {}
            for (const c of [host, ...viewers.values()]) c?.close(1001);
            return new Promise(resolve => server.close(() => resolve()));
        },
        get viewerCount() { return viewers.size; },
        get discoveryPort() { try { return udp?.address().port ?? null; } catch (e) { return null; } },
        get hostConnected() { return !!host; },
    };
}

// ---------------------------------------------------------------- Línia d'ordres
const isMain = process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url;
if (isMain) {
    const args = process.argv.slice(2);
    const arg = (name, fallback) => {
        const i = args.indexOf('--' + name);
        return i >= 0 ? args[i + 1] : fallback;
    };

        const port = parseInt(arg('port', '8787'), 10);
    const pinArg = arg('pin', undefined);
    if (pinArg !== undefined && !/^\d{4,8}$/.test(pinArg)) {
        console.error('El PIN ha de tenir entre 4 i 8 xifres.');
        process.exit(1);
    }

    const relay = createRelay({
        maxViewers: Math.min(3, Math.max(1, parseInt(arg('max-viewers', '3'), 10))),
        pin: pinArg,
        viewerHtml: fs.readFileSync(new URL('./viewer.html', import.meta.url), 'utf8'),
        log: (...a) => console.log(new Date().toLocaleTimeString(), ...a),
    });

    relay.listen(port).then(p => {
        console.log('\n  xCloud Català · Relé de xarxa local');
        console.log('  ───────────────────────────────────');
        console.log(`  PIN:           ${relay.pin}`);
        for (const u of lanUrls(p)) console.log(`  Espectadors:   ${u}`);
        console.log('\n  1) Deixa aquesta finestra oberta.');
        console.log('  2) A xCloud Català activa «Repetidor» i inicia la partida.');
        console.log('  3) Navegador: obre l\'adreça i escriu el PIN.');
        console.log('     App d\'Android: tria «Unir-me a una partida»; apareixerà sol i l\'aproves a la pantalla.\n');
    }).catch(e => {
        console.error('No es pot iniciar el relé:', e.message);
        process.exit(1);
    });
}
