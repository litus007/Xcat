import { GlobalPref } from "@/enums/pref-keys";
import { BxEventBus } from "@utils/bx-event-bus";
import { BxLogger } from "@utils/bx-logger";
import { AppInterface, STATES } from "@utils/global";
import { CE } from "@utils/html";
import { getGlobalPref } from "@utils/pref-utils";
import { Toast } from "@utils/toast";
import { t } from "@utils/translation";
import { GamepadAdapter } from "@modules/gamepad-adapter";

/** Mida d'un fotograma d'entrada de l'espectador (sense l'identificador que hi afegeix el relé). */
const INPUT_FRAME_SIZE = 26;
const RETRY_MS = 4000;
const PILL_VISIBLE_MS = 20000;

type Peer = {
    id: number;
    name: string;
    pc: RTCPeerConnection;
    pendingCandidates: RTCIceCandidateInit[];
    hasRemoteDescription: boolean;
};

/**
 * Repetidor de la partida a altres dispositius de la xarxa local.
 *
 * Aquesta pàgina (l'"amfitrió") es connecta al relé local (programa del PC o servidor de l'app d'Android)
 * i, per cada espectador, obre una connexió WebRTC directa que reenvia les pistes de vídeo i àudio que
 * ja està rebent de la consola/núvol. Els mandos dels espectadors tornen pel relé i es fusionen
 * amb l'adaptador de mandos.
 */
export class RelayHost {
    private static instance: RelayHost;
    public static getInstance = () => RelayHost.instance ?? (RelayHost.instance = new RelayHost());
    private readonly LOG_TAG = 'RelayHost';

    private ws: WebSocket | null = null;
    private active = false;
    private retryTimer: number | null = null;
    private warnedUnavailable = false;
    private peers = new Map<number, Peer>();
    private info: { pin: string; urls: string[] } | null = null;

    private $pill: HTMLElement | null = null;
    private hidePillTimer: number | null = null;
    private readonly adapter = GamepadAdapter.getInstance();

    setup() {
        BxEventBus.Stream.on('state.playing', () => this.start());
        BxEventBus.Stream.on('state.stopped', () => this.stop());
    }

    // ---------------------------------------------------------------- Cicle de vida

    private start() {
        this.stop();
        if (!getGlobalPref(GlobalPref.RELAY_ENABLED)) {
            return;
        }

        this.active = true;
        this.warnedUnavailable = false;
        this.connect();
    }

    private stop() {
        this.active = false;
        this.retryTimer && window.clearTimeout(this.retryTimer);
        this.retryTimer = null;

        const ws = this.ws;
        this.ws = null;
        try { ws?.close(); } catch (e) {}

        this.peers.forEach(peer => this.closePeer(peer));
        this.peers.clear();
        this.adapter.clearRemotes();
        this.hidePill();
    }

    /** L'app d'Android porta el relé incorporat; al PC cal executar-lo (bun relay/relay.mjs). */
    private resolveUrl(): string | null {
        try {
            if (AppInterface && (AppInterface as any).startRelayServer) {
                const port = (AppInterface as any).startRelayServer();
                return port ? `ws://127.0.0.1:${port}/ws?role=host` : null;
            }
        } catch (e) {
            BxLogger.warning(this.LOG_TAG, 'startRelayServer', e);
        }

        return `ws://127.0.0.1:${getGlobalPref(GlobalPref.RELAY_PORT)}/ws?role=host`;
    }

    private connect() {
        if (!this.active) {
            return;
        }

        const url = this.resolveUrl();
        if (!url) {
            return;
        }

        let ws: WebSocket;
        try {
            ws = new WebSocket(url);
        } catch (e) {
            this.scheduleRetry();
            return;
        }

        ws.binaryType = 'arraybuffer';
        this.ws = ws;

        ws.addEventListener('message', e => {
            if (typeof e.data === 'string') {
                try {
                    this.onMessage(JSON.parse(e.data));
                } catch (err) {
                    BxLogger.warning(this.LOG_TAG, 'Missatge no vàlid', err);
                }
            } else {
                this.onInput(e.data as ArrayBuffer);
            }
        });

        ws.addEventListener('error', () => {
            if (!this.warnedUnavailable) {
                this.warnedUnavailable = true;
                Toast.show(t('relay-unavailable'), '📡', { instant: true });
            }
        });

        ws.addEventListener('close', () => {
            if (this.ws !== ws) {
                return;
            }

            this.ws = null;
            this.peers.forEach(peer => this.closePeer(peer));
            this.peers.clear();
            this.adapter.clearRemotes();
            this.scheduleRetry();
        });
    }

    private scheduleRetry() {
        if (!this.active || this.retryTimer) {
            return;
        }

        this.retryTimer = window.setTimeout(() => {
            this.retryTimer = null;
            this.connect();
        }, RETRY_MS);
    }

    private send(obj: any) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        }
    }

    // ---------------------------------------------------------------- Missatges del relé

    private onMessage(msg: any) {
        switch (msg.type) {
            case 'hello':
                this.info = { pin: String(msg.pin), urls: Array.isArray(msg.urls) ? msg.urls : [] };
                (msg.viewers || []).forEach((v: any) => this.onViewerJoined(v.id, v.name));
                this.showPill(true);
                break;
            case 'viewer-joined':
                this.onViewerJoined(msg.id, msg.name);
                break;
            case 'viewer-left':
                this.onViewerLeft(msg.id);
                break;
            case 'signal':
                this.onSignal(msg.from, msg.data);
                break;
        }
    }

    /** [id][1][17 botons u8][4 eixos i16 BE] */
    private onInput(buffer: ArrayBuffer) {
        if (buffer.byteLength !== INPUT_FRAME_SIZE + 1) {
            return;
        }

        const dv = new DataView(buffer);
        if (dv.getUint8(1) !== 1) {
            return;
        }

        const id = dv.getUint8(0);
        const buttons: number[] = new Array(17);
        for (let i = 0; i < 17; i++) {
            buttons[i] = dv.getUint8(2 + i) / 255;
        }

        const axes: number[] = new Array(4);
        for (let i = 0; i < 4; i++) {
            axes[i] = dv.getInt16(19 + i * 2) / 32767;
        }

        this.adapter.setRemoteInput(id, buttons, axes);
    }

    // ---------------------------------------------------------------- WebRTC cap als espectadors

    private async onViewerJoined(id: number, name: string) {
        this.peers.get(id) && this.closePeer(this.peers.get(id)!);

        const source = STATES.currentStream.peerConnection;
        if (!source) {
            return;
        }

        const pc = new RTCPeerConnection({ iceServers: [] }); // només xarxa local
        const peer: Peer = { id, name, pc, pendingCandidates: [], hasRemoteDescription: false };
        this.peers.set(id, peer);

        // Reenvia les pistes que ja rep de la consola (vídeo + àudio)
        const stream = new MediaStream();
        for (const receiver of source.getReceivers()) {
            const track = receiver.track;
            if (track && track.readyState === 'live') {
                try {
                    (track as any).contentHint = track.kind === 'video' ? 'motion' : '';
                } catch (e) {}
                pc.addTrack(track, stream);
            }
        }

        pc.addEventListener('icecandidate', e => {
            e.candidate && this.send({ type: 'signal', to: id, data: e.candidate.toJSON() });
        });

        pc.addEventListener('connectionstatechange', () => {
            BxLogger.info(this.LOG_TAG, `Espectador ${id}`, pc.connectionState);
            if (pc.connectionState === 'connected') {
                this.limitBitrate(pc);
            }
        });

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.send({ type: 'signal', to: id, data: { type: 'offer', sdp: pc.localDescription!.sdp } });
        } catch (e) {
            BxLogger.error(this.LOG_TAG, 'Oferta', e);
        }

        this.showPill(true);
    }

    private onViewerLeft(id: number) {
        const peer = this.peers.get(id);
        peer && this.closePeer(peer);
        this.peers.delete(id);
        this.adapter.removeRemote(id);
        this.showPill(true);
    }

    private async onSignal(from: number, data: any) {
        const peer = this.peers.get(from);
        if (!peer || !data) {
            return;
        }

        try {
            if (data.type === 'answer' && data.sdp) {
                await peer.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
                peer.hasRemoteDescription = true;
                for (const c of peer.pendingCandidates) {
                    await peer.pc.addIceCandidate(c);
                }
                peer.pendingCandidates = [];
            } else if (data.candidate !== undefined) {
                if (peer.hasRemoteDescription) {
                    await peer.pc.addIceCandidate(data);
                } else {
                    peer.pendingCandidates.push(data);
                }
            }
        } catch (e) {
            BxLogger.warning(this.LOG_TAG, 'Senyal', e);
        }
    }

    /** A la xarxa local es permet més taxa de bits que el valor per defecte de WebRTC. */
    private async limitBitrate(pc: RTCPeerConnection) {
        const maxBitrate = (getGlobalPref(GlobalPref.RELAY_BITRATE) as number) * 1_000_000;
        for (const sender of pc.getSenders()) {
            if (sender.track?.kind !== 'video') {
                continue;
            }

            try {
                const params = sender.getParameters();
                if (!params.encodings || !params.encodings.length) {
                    params.encodings = [{}];
                }
                params.encodings[0]!.maxBitrate = maxBitrate;
                await sender.setParameters(params);
            } catch (e) {
                BxLogger.warning(this.LOG_TAG, 'No es pot fixar la taxa de bits', e);
            }
        }
    }

    private closePeer(peer: Peer) {
        try { peer.pc.close(); } catch (e) {}
    }

    // ---------------------------------------------------------------- Indicador (PIN i adreça)

    private showPill(autoHide: boolean) {
        if (!this.info) {
            return;
        }

        if (!this.$pill) {
            this.$pill = CE('div', { class: 'bx-relay-pill' });
            document.documentElement.appendChild(this.$pill);
        }

        const url = this.info.urls[0] ?? '';
        const viewers = this.peers.size ? ` · ${t('relay-viewers', { count: this.peers.size })}` : '';
        this.$pill.textContent = `${t('relay-ready', { pin: this.info.pin })}${url ? ' · ' + url : ''}${viewers}`;
        this.$pill.classList.remove('bx-gone');

        this.hidePillTimer && window.clearTimeout(this.hidePillTimer);
        this.hidePillTimer = autoHide ? window.setTimeout(() => this.hidePill(), PILL_VISIBLE_MS) : null;
    }

    private hidePill() {
        this.hidePillTimer && window.clearTimeout(this.hidePillTimer);
        this.hidePillTimer = null;
        this.$pill?.remove();
        this.$pill = null;
    }
}
