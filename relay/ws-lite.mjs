// Implementació mínima del protocol WebSocket (RFC 6455) sense dependències.
// S'utilitza al relé; funciona igual amb Node i amb Bun.
import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export const OP = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xA };

export function acceptKey(key) {
    return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

/** Crea un fotograma. Els del servidor van sense màscara; els del client (proves) amb màscara. */
export function encodeFrame(opcode, payload = Buffer.alloc(0), mask = false) {
    const len = payload.length;
    let header;
    if (len < 126) {
        header = Buffer.from([0x80 | opcode, (mask ? 0x80 : 0) | len]);
    } else if (len < 65536) {
        header = Buffer.from([0x80 | opcode, (mask ? 0x80 : 0) | 126, len >> 8, len & 0xFF]);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = (mask ? 0x80 : 0) | 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }

    if (!mask) {
        return Buffer.concat([header, payload]);
    }

    const key = crypto.randomBytes(4);
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = payload[i] ^ key[i % 4];
    return Buffer.concat([header, key, masked]);
}

/**
 * Analitzador de fotogrames incremental. Reensambla fragments i retorna missatges complets.
 * Llança una excepció si el client incompleix el protocol o supera `maxPayload`.
 */
export class FrameParser {
    constructor({ maxPayload = 64 * 1024, requireMask = true } = {}) {
        this.maxPayload = maxPayload;
        this.requireMask = requireMask;
        this.buffer = Buffer.alloc(0);
        this.fragments = [];
        this.fragmentOpcode = 0;
        this.fragmentSize = 0;
    }

    push(chunk) {
        this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
        const messages = [];

        for (;;) {
            if (this.buffer.length < 2) break;

            const b0 = this.buffer[0];
            const b1 = this.buffer[1];
            const fin = (b0 & 0x80) !== 0;
            const opcode = b0 & 0x0F;
            const masked = (b1 & 0x80) !== 0;
            let length = b1 & 0x7F;
            let offset = 2;

            if ((b0 & 0x70) !== 0) throw new Error('bits RSV no suportats');
            if (this.requireMask && !masked) throw new Error('el client ha d\'enviar fotogrames emmascarats');

            if (length === 126) {
                if (this.buffer.length < 4) break;
                length = this.buffer.readUInt16BE(2);
                offset = 4;
            } else if (length === 127) {
                if (this.buffer.length < 10) break;
                const big = this.buffer.readBigUInt64BE(2);
                if (big > BigInt(this.maxPayload)) throw new Error('fotograma massa gran');
                length = Number(big);
                offset = 10;
            }

            if (length > this.maxPayload) throw new Error('fotograma massa gran');
            if (opcode >= 0x8 && (!fin || length > 125)) throw new Error('fotograma de control no vàlid');

            const total = offset + (masked ? 4 : 0) + length;
            if (this.buffer.length < total) break;

            let payload = Buffer.from(this.buffer.subarray(offset + (masked ? 4 : 0), total));
            if (masked) {
                const key = this.buffer.subarray(offset, offset + 4);
                for (let i = 0; i < payload.length; i++) payload[i] ^= key[i % 4];
            }
            this.buffer = this.buffer.subarray(total);

            if (opcode >= 0x8) {
                messages.push({ opcode, payload });
                continue;
            }

            if (opcode !== OP.CONT) {
                if (this.fragments.length) throw new Error('fragment inesperat');
                this.fragmentOpcode = opcode;
            } else if (!this.fragments.length) {
                throw new Error('continuació sense inici');
            }

            this.fragmentSize += payload.length;
            if (this.fragmentSize > this.maxPayload) throw new Error('missatge massa gran');
            this.fragments.push(payload);

            if (fin) {
                messages.push({ opcode: this.fragmentOpcode, payload: Buffer.concat(this.fragments) });
                this.fragments = [];
                this.fragmentSize = 0;
            }
        }

        return messages;
    }
}
