import { GlobalPref } from "@/enums/pref-keys";
import { BxEventBus } from "@utils/bx-event-bus";
import { BxLogger } from "@utils/bx-logger";
import { STATES } from "@utils/global";
import { CE } from "@utils/html";
import { getGlobalPref } from "@utils/pref-utils";
import { t } from "@utils/translation";

export type ConnectionKind = 'local' | 'internet' | 'relay';

const TICK_MS = 2000;
const STALL_TICKS = 4;            // 4 x 2 s sense dades de vídeo = sessió encallada
const DISCONNECTED_GRACE_MS = 8000;
const MAX_ATTEMPTS = 3;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const STABLE_AFTER_MS = 30 * 1000;
const STORAGE_KEY = 'BetterXcloud.Reconnect';

/** Adreça IP de xarxa privada (LAN)? */
export function isPrivateAddress(ip: string | undefined): boolean {
    if (!ip) {
        return false;
    }

    ip = ip.toLowerCase();
    if (ip.includes(':')) {
        // IPv6: enllaç local (fe80::/10), local única (fc00::/7) i loopback
        return ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')
            || ip.startsWith('fc') || ip.startsWith('fd') || ip === '::1';
    }

    const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) {
        return false;
    }

    const a = +m[1]!;
    const b = +m[2]!;
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/**
 * Monitor de la connexió durant la partida:
 *  - indicador "local / internet / relay" a partir del parell de candidats ICE seleccionat,
 *  - reconnexió automàtica si la sessió cau o s'encalla,
 *  - mode de baixa latència (buffer de vídeo mínim).
 */
export class ConnectionMonitor {
    private static instance: ConnectionMonitor;
    public static getInstance = () => ConnectionMonitor.instance ?? (ConnectionMonitor.instance = new ConnectionMonitor());
    private readonly LOG_TAG = 'ConnectionMonitor';

    private pc: RTCPeerConnection | null = null;
    private timer: number | null = null;
    private disconnectTimer: number | null = null;
    private stableTimer: number | null = null;
    private reconnectTimers: number[] = [];

    private lastBytes = -1;
    private stalledTicks = 0;
    private lastKind: ConnectionKind | null = null;
    private reconnecting = false;
    private cancelled = false;

    private $pill: HTMLElement | null = null;
    private $pillText: HTMLElement | null = null;
    private $pillButton: HTMLElement | null = null;
    private hidePillTimer: number | null = null;

    setup() {
        BxEventBus.Stream.on('state.playing', () => this.start());
        BxEventBus.Stream.on('state.stopped', () => this.stop());
    }

    // ---------------------------------------------------------------- Cicle de vida

    private start() {
        this.stop();

        const pc = STATES.currentStream.peerConnection;
        if (!pc) {
            return;
        }

        this.pc = pc;
        this.lastBytes = -1;
        this.stalledTicks = 0;
        this.lastKind = null;
        this.cancelled = false;

        pc.addEventListener('connectionstatechange', this.onConnectionState);
        this.applyLowLatency(pc);

        this.timer = window.setInterval(() => this.tick(), TICK_MS);
        this.tick();

        // Si porta 30 s estable, es reinicia el comptador d'intents
        this.stableTimer = window.setTimeout(() => this.resetAttempts(), STABLE_AFTER_MS);
    }

    private stop() {
        this.pc?.removeEventListener('connectionstatechange', this.onConnectionState);
        this.pc = null;

        this.timer && window.clearInterval(this.timer);
        this.disconnectTimer && window.clearTimeout(this.disconnectTimer);
        this.stableTimer && window.clearTimeout(this.stableTimer);
        this.timer = this.disconnectTimer = this.stableTimer = null;

        // Si la partida s'atura mentre hi ha un compte enrere (p. ex. l'usuari surt), cancel·la'l
        this.clearReconnect();
        this.hidePill();
    }

    // ---------------------------------------------------------------- Estadístiques i indicador

    private async tick() {
        const pc = this.pc;
        if (!pc || pc.connectionState === 'closed') {
            return;
        }

        let stats: RTCStatsReport;
        try {
            stats = await pc.getStats();
        } catch (e) {
            return;
        }

        const pairs: Record<string, any> = {};
        const locals: Record<string, any> = {};
        const remotes: Record<string, any> = {};
        let selectedPairId: string | undefined;
        let videoBytes = -1;

        stats.forEach((stat: any) => {
            switch (stat.type) {
                case 'transport':
                    stat.selectedCandidatePairId && (selectedPairId = stat.selectedCandidatePairId);
                    break;
                case 'candidate-pair':
                    pairs[stat.id] = stat;
                    break;
                case 'local-candidate':
                    locals[stat.id] = stat;
                    break;
                case 'remote-candidate':
                    remotes[stat.id] = stat;
                    break;
                case 'inbound-rtp':
                    if (stat.kind === 'video') {
                        videoBytes = stat.bytesReceived ?? videoBytes;
                    }
                    break;
            }
        });

        this.checkStall(videoBytes);

        // Parell de candidats seleccionat
        let pair = selectedPairId ? pairs[selectedPairId] : undefined;
        if (!pair) {
            pair = Object.values(pairs).find((p: any) => p.nominated && p.state === 'succeeded');
        }

        if (!pair) {
            return;
        }

        const local = locals[pair.localCandidateId];
        const remote = remotes[pair.remoteCandidateId];
        const kind = this.classify(local, remote);
        const rttMs = typeof pair.currentRoundTripTime === 'number' ? Math.round(pair.currentRoundTripTime * 1000) : null;

        if (kind !== this.lastKind) {
            this.lastKind = kind;
            this.showIndicator(kind, rttMs);
        }
    }

    private classify(local: any, remote: any): ConnectionKind {
        if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') {
            return 'relay';
        }

        const remoteAddress = remote?.address ?? remote?.ip;
        if (remote?.candidateType === 'host' || isPrivateAddress(remoteAddress)) {
            return 'local';
        }

        return 'internet';
    }

    private showIndicator(kind: ConnectionKind, rttMs: number | null) {
        if (!getGlobalPref(GlobalPref.NETWORK_INDICATOR)) {
            return;
        }

        const icon = kind === 'local' ? '🏠' : kind === 'relay' ? '🔁' : '🌐';
        const label = t(kind === 'local' ? 'network-local' : kind === 'relay' ? 'network-relay' : 'network-internet');
        this.showPill(`${icon} ${label}${rttMs !== null ? ` · ${rttMs} ms` : ''}`, false, 6000);
    }

    // ---------------------------------------------------------------- Reconnexió automàtica

    private checkStall(videoBytes: number) {
        if (videoBytes < 0 || document.visibilityState === 'hidden') {
            this.stalledTicks = 0;
            return;
        }

        if (videoBytes === this.lastBytes) {
            this.stalledTicks++;
            if (this.stalledTicks >= STALL_TICKS) {
                this.stalledTicks = 0;
                this.reconnect('stall');
            }
        } else {
            this.stalledTicks = 0;
        }

        this.lastBytes = videoBytes;
    }

    private onConnectionState = () => {
        const pc = this.pc;
        if (!pc) {
            return;
        }

        const state = pc.connectionState;
        BxLogger.info(this.LOG_TAG, 'connectionState', state);

        if (state === 'failed') {
            this.reconnect('failed');
        } else if (state === 'disconnected') {
            this.disconnectTimer && window.clearTimeout(this.disconnectTimer);
            this.disconnectTimer = window.setTimeout(() => {
                if (this.pc?.connectionState === 'disconnected') {
                    this.reconnect('disconnected');
                }
            }, DISCONNECTED_GRACE_MS);
        } else if (state === 'connected') {
            this.disconnectTimer && window.clearTimeout(this.disconnectTimer);
        }
        // "closed" = sortida voluntària de l'usuari: no es reconnecta
    };

    private isLaunchPage() {
        return window.location.pathname.includes('/launch/');
    }

    private readAttempts(): { count: number; ts: number } {
        try {
            const data = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || 'null');
            if (data && Date.now() - data.ts < ATTEMPT_WINDOW_MS) {
                return data;
            }
        } catch (e) {}

        return { count: 0, ts: Date.now() };
    }

    private resetAttempts() {
        try {
            window.sessionStorage.removeItem(STORAGE_KEY);
        } catch (e) {}
    }

    private reconnect(reason: string) {
        if (this.reconnecting || this.cancelled || !getGlobalPref(GlobalPref.NETWORK_AUTO_RECONNECT) || !this.isLaunchPage()) {
            return;
        }

        const { count } = this.readAttempts();
        if (count >= MAX_ATTEMPTS) {
            BxLogger.warning(this.LOG_TAG, 'Massa intents de reconnexió');
            this.showPill('⚠️ ' + t('network-reconnect-failed'), false, 8000);
            this.resetAttempts();
            return;
        }

        BxLogger.info(this.LOG_TAG, 'Reconnectant per', reason);
        this.reconnecting = true;

        const attempt = count + 1;
        let seconds = 3 * Math.pow(2, count); // 3 s, 6 s, 12 s

        const render = () => this.showPill('🔄 ' + t('network-reconnecting', { seconds, attempt, max: MAX_ATTEMPTS }), true);
        render();

        const interval = window.setInterval(() => {
            seconds--;
            if (seconds <= 0) {
                this.clearReconnect();
                try {
                    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ count: attempt, ts: Date.now() }));
                } catch (e) {}
                window.location.reload();
                return;
            }

            render();
        }, 1000);

        this.reconnectTimers.push(interval);
    }

    private clearReconnect() {
        this.reconnectTimers.forEach(id => window.clearInterval(id));
        this.reconnectTimers = [];
        this.reconnecting = false;
    }

    private cancelReconnect = () => {
        this.cancelled = true;
        this.clearReconnect();
        this.resetAttempts();
        this.hidePill();
    };

    // ---------------------------------------------------------------- Baixa latència

    private applyLowLatency(pc: RTCPeerConnection) {
        if (!getGlobalPref(GlobalPref.NETWORK_LOW_LATENCY)) {
            return;
        }

        const apply = () => {
            for (const receiver of pc.getReceivers() as any[]) {
                if (receiver.track?.kind !== 'video') {
                    continue;
                }

                try {
                    if ('jitterBufferTarget' in receiver) {
                        receiver.jitterBufferTarget = 0;
                    }

                    if ('playoutDelayHint' in receiver) {
                        receiver.playoutDelayHint = 0;
                    }
                } catch (e) {
                    BxLogger.warning(this.LOG_TAG, 'No es pot reduir el buffer de vídeo', e);
                }
            }
        };

        apply();
        pc.addEventListener('track', apply);
    }

    // ---------------------------------------------------------------- Indicador visual

    private ensurePill() {
        if (this.$pill) {
            return;
        }

        this.$pillText = CE('span', { class: 'bx-net-pill-text' });
        this.$pillButton = CE('button', { class: 'bx-net-pill-btn', type: 'button' }, t('cancel'));
        this.$pillButton.addEventListener('click', this.cancelReconnect);

        this.$pill = CE('div', { class: 'bx-net-pill bx-gone' }, this.$pillText, this.$pillButton);
        document.documentElement.appendChild(this.$pill);
    }

    private showPill(text: string, withCancel: boolean, autoHideMs = 0) {
        this.ensurePill();
        this.$pillText!.textContent = text;
        this.$pillButton!.classList.toggle('bx-gone', !withCancel);
        this.$pill!.classList.remove('bx-gone');

        this.hidePillTimer && window.clearTimeout(this.hidePillTimer);
        this.hidePillTimer = autoHideMs ? window.setTimeout(() => this.hidePill(), autoHideMs) : null;
    }

    private hidePill() {
        this.hidePillTimer && window.clearTimeout(this.hidePillTimer);
        this.hidePillTimer = null;
        this.$pill?.classList.add('bx-gone');
    }
}
