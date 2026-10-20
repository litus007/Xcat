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
const HEARTBEAT_MS = 10000;
const PEER_GRACE_MS = 60000;      // temps que es mantenen els parells WebRTC si cau la senyalització
const PILL_VISIBLE_MS = 20000;
const TRUSTED_KEY = 'BetterXcloud.RelayTrusted';
const MAX_TRUSTED = 20;

type Peer = {
    id: number;
    name: string;
    sid: string;
    vsid: number;
    pc: RTCPeerConnection;
    pendingCandidates: RTCIceCandidateInit[];
    hasRemoteDescription: boolean;
};

type JoinRequest = { rid: number; name: string; deviceId: string; ip: string };
export type ApprovalAnswer = 'allow' | 'always' | 'deny';

/**
 * Repetidor de la partida a altres dispositius de la xarxa local.
 *
 * Aquesta pàgina (l'"amfitrió") es connecta al relé local (programa del PC o servidor de l'app d'Android)
 * i, per cada espectador, obre una connexió WebRTC directa que reenvia el vídeo i l'àudio que ja rep de la
 * consola/núvol. Els mandos dels espectadors tornen pel relé i es converteixen en jugadors reals
 * (cooperatiu local) o es fusionen amb el jugador 1, segons la configuració.
 */
export class RelayHost {
    private static instance: RelayHost;
    public static getInstance = () => RelayHost.instance ?? (RelayHost.instance = new RelayHost());
    private readonly LOG_TAG = 'RelayHost';

    private ws: WebSocket | null = null;
    private active = false;
    private retryTimer: number | null = null;
    private heartbeatTimer: number | null = null;
    private graceTimer: number | null = null;
    private diagTimer: number | null = null;
    private warnedUnavailable = false;
    private peers = new Map<number, Peer>();
    private info: { pin: string; urls: string[]; name?: string } | null = null;
    private audio: { ctx: AudioContext; sink: HTMLAudioElement; track: MediaStreamTrack } | null = null;

    private $pill: HTMLElement | null = null;
    private hidePillTimer: number | null = null;
    private promptQueue: JoinRequest[] = [];
    private $prompt: HTMLElement | null = null;
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
        this.heartbeatTimer && window.clearInterval(this.heartbeatTimer);
        this.graceTimer && window.clearTimeout(this.graceTimer);
        this.diagTimer && window.clearInterval(this.diagTimer);
        this.retryTimer = this.heartbeatTimer = this.graceTimer = this.diagTimer = null;

        const ws = this.ws;
        this.ws = null;
        try { ws?.close(); } catch (e) {}

        this.closeAllPeers();
        this.releaseAudio();
        this.closePrompt(true);
        this.hidePill();
    }

    private closeAllPeers() {
        this.peers.forEach(peer => this.closePeer(peer));
        this.peers.clear();
        this.adapter.clearRemotes();
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

        ws.addEventListener('open', () => {
            // Batec: manté viva la connexió encara que no hi hagi res a dir
            this.heartbeatTimer && window.clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = window.setInterval(() => this.send({ type: 'ping' }), HEARTBEAT_MS);
        });

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
            this.heartbeatTimer && window.clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
            this.closePrompt(true);

            // Les connexions WebRTC són directes: no depenen del relé. Es conserven una estona
            // per si el relé torna (es reconcilien en rebre el nou "hello").
            this.graceTimer && window.clearTimeout(this.graceTimer);
            this.graceTimer = window.setTimeout(() => this.closeAllPeers(), PEER_GRACE_MS);

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
                this.onHello(msg);
                break;
            case 'viewer-joined':
                this.onViewerJoined(msg.id, msg.name, msg.vsid);
                break;
            case 'viewer-left':
                this.onViewerLeft(msg.id);
                break;
            case 'signal':
                this.onSignal(msg.from, msg.data);
                break;
            case 'join-request':
                this.onJoinRequest({ rid: msg.rid, name: String(msg.name || '?'), deviceId: String(msg.deviceId || ''), ip: String(msg.ip || '') });
                break;
        }
    }

    private onHello(msg: any) {
        this.info = { pin: String(msg.pin), urls: Array.isArray(msg.urls) ? msg.urls : [], name: msg.name };
        this.graceTimer && window.clearTimeout(this.graceTimer);
        this.graceTimer = null;

        // Reconciliació: s'eliminen els parells d'espectadors que ja no hi són i es mantenen els que van bé
        const listed = new Map<number, { name: string; vsid: number }>((msg.viewers || []).map((v: any) => [v.id, { name: v.name, vsid: v.vsid }]));
        for (const [id, peer] of Array.from(this.peers.entries())) {
            if (!listed.has(id) || listed.get(id)!.vsid !== peer.vsid) {
                this.closePeer(peer);
                this.peers.delete(id);
                this.adapter.removeRemote(id);
            }
        }

        listed.forEach((v, id) => this.onViewerJoined(id, v.name, v.vsid));

        this.showPill(true);
        this.startDiagnostics();
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

    // ---------------------------------------------------------------- Aprovació d'espectadors (sense PIN)

    private loadTrusted(): string[] {
        try {
            const list = JSON.parse(window.localStorage.getItem(TRUSTED_KEY) || '[]');
            return Array.isArray(list) ? list.filter(x => typeof x === 'string') : [];
        } catch (e) {
            return [];
        }
    }

    private saveTrusted(deviceId: string) {
        if (!deviceId) {
            return;
        }

        const list = this.loadTrusted().filter(id => id !== deviceId);
        list.push(deviceId);
        try {
            window.localStorage.setItem(TRUSTED_KEY, JSON.stringify(list.slice(-MAX_TRUSTED)));
        } catch (e) {}
    }

    /** Pregunta a la persona davant la pantalla. És un mètode a part perquè es pugui substituir (proves). */
    protected askApproval(req: JoinRequest): Promise<ApprovalAnswer> {
        return new Promise(resolve => {
            const answer = (a: ApprovalAnswer) => { this.closePrompt(false); resolve(a); };
            const mk = (label: string, cls: string, a: ApprovalAnswer) => {
                const $b = CE('button', { class: `bx-relay-btn ${cls}`, type: 'button' }, label);
                $b.addEventListener('click', () => answer(a));
                return $b;
            };

            this.$prompt?.remove();
            this.$prompt = CE('div', { class: 'bx-relay-prompt', role: 'alertdialog' },
                CE('div', { class: 'bx-relay-prompt-title' }, t('relay-request', { name: req.name })),
                CE('div', { class: 'bx-relay-prompt-note' }, req.ip),
                CE('div', { class: 'bx-relay-prompt-buttons' },
                    mk(t('relay-allow'), 'bx-relay-allow', 'allow'),
                    req.deviceId ? mk(t('relay-allow-always'), 'bx-relay-allow', 'always') : null,
                    mk(t('relay-deny'), 'bx-relay-deny', 'deny'),
                ),
            );
            document.documentElement.appendChild(this.$prompt);
            (this.$prompt as any).__resolve = () => resolve('deny');
        });
    }

    private closePrompt(denyPending: boolean) {
        const $p = this.$prompt as any;
        this.$prompt = null;
        $p?.remove();
        denyPending && $p?.__resolve?.();
    }

    private async onJoinRequest(req: JoinRequest) {
        // Dispositius ja aprovats abans: entren sols
        if (req.deviceId && this.loadTrusted().includes(req.deviceId)) {
            this.send({ type: 'approve', rid: req.rid });
            return;
        }

        this.promptQueue.push(req);
        if (this.promptQueue.length > 1) {
            return; // ja hi ha un diàleg obert: les altres esperen el seu torn
        }

        while (this.promptQueue.length) {
            const current = this.promptQueue[0]!;
            const answer = await this.askApproval(current);
            this.promptQueue.shift();

            if (answer === 'deny') {
                this.send({ type: 'deny', rid: current.rid });
            } else {
                answer === 'always' && this.saveTrusted(current.deviceId);
                this.send({ type: 'approve', rid: current.rid });
            }
        }
    }

    // ---------------------------------------------------------------- Àudio

    /**
     * L'àudio es passa per WebAudio: és més fiable que reenviar directament una pista remota d'àudio,
     * que a Chrome pot arribar en silenci. El <audio> mut manté la pista "activa" (error conegut de Chrome).
     */
    private getAudioTrack(source: RTCPeerConnection): MediaStreamTrack | null {
        if (this.audio) {
            return this.audio.track;
        }

        const original = source.getReceivers().map(r => r.track).find(tr => tr?.kind === 'audio' && tr.readyState === 'live') || null;
        if (!original) {
            return null;
        }

        try {
            const sink = new Audio();
            sink.muted = true;
            sink.srcObject = new MediaStream([original]);
            sink.play().catch(() => {});

            const ctx = new AudioContext({ latencyHint: 'interactive' });
            const node = ctx.createMediaStreamSource(new MediaStream([original]));
            const dest = ctx.createMediaStreamDestination();
            node.connect(dest);
            ctx.resume().catch(() => {});

            const track = dest.stream.getAudioTracks()[0]!;
            this.audio = { ctx, sink, track };
            return track;
        } catch (e) {
            BxLogger.warning(this.LOG_TAG, 'WebAudio no disponible: es reenvia la pista directament', e);
            return original;
        }
    }

    private releaseAudio() {
        if (!this.audio) {
            return;
        }

        try { this.audio.sink.srcObject = null; } catch (e) {}
        try { this.audio.ctx.close(); } catch (e) {}
        this.audio = null;
    }

    // ---------------------------------------------------------------- WebRTC cap als espectadors

    private async onViewerJoined(id: number, name: string, vsid: number) {
        // Mateixa unió i la connexió va bé: no es fa res (el relé informa dues vegades en tornar el host)
        const existing = this.peers.get(id);
        if (existing && existing.vsid === vsid && ['new', 'connecting', 'connected'].includes(existing.pc.connectionState)) {
            return;
        }

        existing && this.closePeer(existing);

        const source = STATES.currentStream.peerConnection;
        if (!source) {
            return;
        }

        const pc = new RTCPeerConnection({ iceServers: [] }); // només xarxa local
        const sid = Math.random().toString(36).slice(2, 10);
        const peer: Peer = { id, name, sid, vsid, pc, pendingCandidates: [], hasRemoteDescription: false };
        this.peers.set(id, peer);

        const stream = new MediaStream();
        const video = source.getReceivers().map(r => r.track).find(tr => tr?.kind === 'video' && tr.readyState === 'live');
        if (video) {
            try {
                (video as any).contentHint = 'motion';
            } catch (e) {}
            pc.addTrack(video, stream);
        }

        const audio = this.getAudioTrack(source);
        audio && pc.addTrack(audio, stream);

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
            this.send({ type: 'signal', to: id, data: { type: 'offer', sid, sdp: pc.localDescription!.sdp } });
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

    // ---------------------------------------------------------------- Indicador (PIN, adreça i estat)

    private startDiagnostics() {
        this.diagTimer && window.clearInterval(this.diagTimer);
        // Mentre hi hagi espectadors, la píndola mostra quants mandos envien dades (útil per diagnosticar)
        this.diagTimer = window.setInterval(() => this.peers.size && this.$pill && this.showPill(false, true), 2000);
    }

    private activeRemotePads(): number {
        const now = performance.now();
        let count = 0;
        this.adapter.remotes.forEach(r => now - r.lastSeen < 2000 && count++);
        return count;
    }

    private showPill(autoHide: boolean, keepTimer = false) {
        if (!this.info) {
            return;
        }

        if (!this.$pill) {
            this.$pill = CE('div', { class: 'bx-relay-pill' });
            document.documentElement.appendChild(this.$pill);
        }

        const url = this.info.urls[0] ?? '';
        const viewers = this.peers.size ? ` · ${t('relay-viewers', { count: this.peers.size })} · ${t('relay-diag-input', { count: this.activeRemotePads() })}` : '';
        this.$pill.textContent = `${t('relay-ready', { pin: this.info.pin })}${url ? ' · ' + url : ''}${viewers}`;
        this.$pill.classList.remove('bx-gone');

        if (keepTimer) {
            return;
        }

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
