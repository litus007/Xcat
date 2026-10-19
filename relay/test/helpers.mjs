import net from 'node:net';
import crypto from 'node:crypto';
import { encodeFrame, FrameParser, OP } from '../ws-lite.mjs';

export const openSockets = new Set();

/** Client WebSocket de prova (amb màscara, com un navegador). */
export function connect(port, { role, origin, hostHeader } = {}) {
    return new Promise((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1');
        openSockets.add(socket);
        const parser = new FrameParser({ requireMask: false });
        const inbox = [];
        const waiters = [];
        let handshake = Buffer.alloc(0);
        let upgraded = false;
        let status = 0;

        const deliver = () => {
            for (let i = waiters.length - 1; i >= 0; i--) {
                const idx = inbox.findIndex(waiters[i].pred);
                if (idx >= 0) { const [m] = inbox.splice(idx, 1); waiters[i].resolve(m); waiters.splice(i, 1); }
            }
        };

        const client = {
            socket, inbox,
            sendJson: o => socket.write(encodeFrame(OP.TEXT, Buffer.from(JSON.stringify(o)), true)),
            sendBinary: b => socket.write(encodeFrame(OP.BINARY, Buffer.from(b), true)),
            next: (pred = () => true, ms = 1500) => new Promise((res, rej) => {
                const idx = inbox.findIndex(pred);
                if (idx >= 0) return res(inbox.splice(idx, 1)[0]);
                const w = { pred, resolve: res };
                waiters.push(w);
                setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); rej(new Error('timeout')); } }, ms);
            }),
            json: (type, ms) => client.next(m => m.json?.type === type, ms).then(m => m.json),
            closed: new Promise(r => socket.on('close', r)),
            status: () => status,
        };

        socket.on('connect', () => {
            const headers = [
                `GET /ws?role=${role} HTTP/1.1`,
                `Host: ${hostHeader ?? `127.0.0.1:${port}`}`,
                'Upgrade: websocket', 'Connection: Upgrade',
                `Sec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}`,
                'Sec-WebSocket-Version: 13',
            ];
            if (origin) headers.push(`Origin: ${origin}`);
            socket.write(headers.join('\r\n') + '\r\n\r\n');
        });

        socket.on('data', chunk => {
            if (!upgraded) {
                handshake = Buffer.concat([handshake, chunk]);
                const end = handshake.indexOf('\r\n\r\n');
                if (end < 0) return;
                status = parseInt(handshake.toString().split(' ')[1], 10);
                const rest = handshake.subarray(end + 4);
                if (status !== 101) return resolve(client);
                upgraded = true;
                resolve(client);
                chunk = rest;
                if (!chunk.length) return;
            }
            for (const m of parser.push(chunk)) {
                const item = { opcode: m.opcode, payload: m.payload };
                if (m.opcode === OP.TEXT) item.json = JSON.parse(m.payload.toString());
                inbox.push(item);
            }
            deliver();
        });
        socket.on('error', () => {});
    });
}

