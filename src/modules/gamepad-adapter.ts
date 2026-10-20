import { GlobalPref, StorageKey } from "@/enums/pref-keys";
import { BxLogger } from "@utils/bx-logger";
import { getGlobalPref, getStreamPref } from "@utils/pref-utils";
import { StreamPref } from "@/enums/pref-keys";
import { Toast } from "@utils/toast";
import { t } from "@utils/translation";
import { BxEvent } from "@utils/bx-event";

/**
 * Adaptador de mandos ("mando virtual Xbox").
 *
 * xCloud només entén el layout "standard" del Gamepad API (el d'un mando Xbox). Molts mandos
 * (PlayStation, Nintendo, genèrics USB/Bluetooth) arriben amb `mapping === ''` i els botons i eixos
 * en un ordre arbitrari. Aquest mòdul intercepta `navigator.getGamepads()` i l'event `GamepadEvent`
 * i retorna, per a cada mando físic, un mando virtual amb layout estàndard Xbox.
 *
 * - Mandos ja estàndard: passen tal qual (amb opció d'intercanviar A↔B i X↔Y per a disposició Nintendo).
 * - Mandos no estàndard: es tradueixen amb un perfil (automàtic per fabricant o assignat per l'usuari).
 */

/** Índexs del layout estàndard del Gamepad API. */
export enum XKey {
    A = 0, B = 1, X = 2, Y = 3,
    LB = 4, RB = 5, LT = 6, RT = 7,
    SELECT = 8, START = 9, L3 = 10, R3 = 11,
    UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15,
    HOME = 16,
}

export enum XAxis { LX = 0, LY = 1, RX = 2, RY = 3 }

/** Origen d'un valor al mando físic. */
export type SourceRef =
    | { t: 'b'; i: number }                         // botó físic
    | { t: 'a'; i: number; d: 1 | -1 }              // eix físic, direcció positiva o negativa (valor 0..1)
    | { t: 'f'; i: number; inv?: boolean }          // eix físic complet, rang -1..1 (palanques)
    | { t: 'tr'; i: number }                        // eix de gallet amb rang -1..1 (repòs a -1)
    | { t: 'h'; i: number; d: 'u' | 'r' | 'd' | 'l' }; // D-pad codificat en un eix "hat"

export type AdapterProfile = {
    buttons: { [key: number]: SourceRef | null };
    axes: { [key: number]: SourceRef | null };
};

export type PhysicalInfo = {
    key: string;
    name: string;
    vendor: string;
    product: string;
};

export const VIRTUAL_PAD_ID = 'xCloud Català Pad';
const DEFAULT_DEADZONE = 0.08;
const CONFIG_REFRESH_MS = 500;

/** Valors típics d'un eix "hat" (D-pad en un eix) segons el navegador. */
const HAT_VALUES = {
    u: [-1],
    ur: [-0.7143],
    r: [-0.4286],
    dr: [-0.1429],
    d: [0.1429],
    dl: [0.4286],
    l: [0.7143],
    ul: [1],
} as const;

function hatDirections(value: number): { u: boolean; r: boolean; d: boolean; l: boolean } {
    const dirs = { u: false, r: false, d: false, l: false };
    // Valor de repòs: ~1.2857 (o fora del rang)
    if (value > 1.1 || value < -1.1 || Number.isNaN(value)) {
        return dirs;
    }

    let best: keyof typeof HAT_VALUES | null = null;
    let bestDiff = 0.08;
    for (const name in HAT_VALUES) {
        const diff = Math.abs(HAT_VALUES[name as keyof typeof HAT_VALUES][0] - value);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = name as keyof typeof HAT_VALUES;
        }
    }

    if (best) {
        dirs.u = best.includes('u');
        dirs.d = best.includes('d');
        dirs.l = best.includes('l');
        dirs.r = best.includes('r');
    }

    return dirs;
}

/** Perfil identitat: el mando ja segueix l'ordre estàndard (però amb mapping buit). */
function identityProfile(): AdapterProfile {
    const buttons: AdapterProfile['buttons'] = {};
    for (let i = 0; i <= 16; i++) {
        buttons[i] = { t: 'b', i };
    }

    return {
        buttons,
        axes: {
            0: { t: 'f', i: 0 },
            1: { t: 'f', i: 1 },
            2: { t: 'f', i: 2 },
            3: { t: 'f', i: 3 },
        },
    };
}

/** DualShock 4 / DualSense amb mapping no estàndard (Firefox/Linux i alguns Android antics). */
function sonyLegacyProfile(): AdapterProfile {
    const p = identityProfile();
    // Quadrat=0, Creu=1, Cercle=2, Triangle=3
    p.buttons[XKey.A] = { t: 'b', i: 1 };
    p.buttons[XKey.B] = { t: 'b', i: 2 };
    p.buttons[XKey.X] = { t: 'b', i: 0 };
    p.buttons[XKey.Y] = { t: 'b', i: 3 };
    p.buttons[XKey.SELECT] = { t: 'b', i: 8 };
    p.buttons[XKey.START] = { t: 'b', i: 9 };
    p.buttons[XKey.L3] = { t: 'b', i: 10 };
    p.buttons[XKey.R3] = { t: 'b', i: 11 };
    p.buttons[XKey.HOME] = { t: 'b', i: 12 };
    p.buttons[XKey.UP] = { t: 'h', i: 9, d: 'u' };
    p.buttons[XKey.RIGHT] = { t: 'h', i: 9, d: 'r' };
    p.buttons[XKey.DOWN] = { t: 'h', i: 9, d: 'd' };
    p.buttons[XKey.LEFT] = { t: 'h', i: 9, d: 'l' };
    p.axes[XAxis.RY] = { t: 'f', i: 5 };
    return p;
}

/** Perfils automàtics per fabricant (best-effort; l'assistent manual té prioritat). */
function autoProfile(info: PhysicalInfo, gamepad: Gamepad): AdapterProfile {
    const vendor = info.vendor.toLowerCase();
    if (vendor === '054c' && gamepad.axes.length >= 6) {
        return sonyLegacyProfile();
    }

    return identityProfile();
}

function cloneProfile(p: AdapterProfile): AdapterProfile {
    return JSON.parse(JSON.stringify(p));
}

export function getPhysicalInfo(gamepad: Gamepad): PhysicalInfo {
    const id = gamepad.id || '';
    let vendor = '';
    let product = '';

    // Chrome: "Nom (Vendor: 054c Product: 09cc)"
    let m = id.match(/Vendor:\s*([0-9a-f]{4})\s+Product:\s*([0-9a-f]{4})/i);
    if (m) {
        vendor = m[1]!.toLowerCase();
        product = m[2]!.toLowerCase();
    } else {
        // Firefox: "054c-09cc-Nom"
        m = id.match(/^([0-9a-f]{4})-([0-9a-f]{4})-/i);
        if (m) {
            vendor = m[1]!.toLowerCase();
            product = m[2]!.toLowerCase();
        }
    }

    const name = id.replace(/\s*\(.*?\)\s*$/, '').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '').trim() || id;
    const key = vendor && product ? `${vendor}:${product}:${gamepad.axes.length}:${gamepad.buttons.length}` : `${name}:${gamepad.axes.length}:${gamepad.buttons.length}`;

    return { key, name, vendor, product };
}

type AdaptedGamepad = {
    id: string;
    index: number;
    connected: boolean;
    mapping: 'standard';
    timestamp: number;
    axes: number[];
    buttons: Array<{ pressed: boolean; touched: boolean; value: number }>;
    vibrationActuator: any;
    hapticActuators: any;
    _bxAdapted: true;
    _bxPhysicalIndex: number;
};

export class GamepadAdapter {
    private static instance: GamepadAdapter;
    public static getInstance = () => GamepadAdapter.instance ?? (GamepadAdapter.instance = new GamepadAdapter());

    private readonly LOG_TAG = 'GamepadAdapter';

    private installed = false;
    private nativeGetGamepads!: Navigator['getGamepads'];

    private adapted: Array<AdaptedGamepad | null> = [];
    private profiles: Record<string, AdapterProfile> = {};
    private learningKeys = new Set<string>();

    private config = { enabled: false, swapFace: false, deadzone: DEFAULT_DEADZONE, remoteMode: 'shared' };
    private configTimestamp = 0;

    private constructor() {
        this.loadProfiles();
    }

    /** Instal·la els ganxos. Cal cridar-ho aviat (abans que el mòdul de ratolí i teclat). */
    install() {
        if (this.installed || !('getGamepads' in window.navigator)) {
            return;
        }

        this.installed = true;
        this.nativeGetGamepads = window.navigator.getGamepads.bind(window.navigator);
        window.navigator.getGamepads = this.patchedGetGamepads;

        // Els esdeveniments "gamepadconnected" també han de rebre el mando virtual
        try {
            const proto = window.GamepadEvent?.prototype;
            const desc = proto && Object.getOwnPropertyDescriptor(proto, 'gamepad');
            if (proto && desc?.get) {
                const nativeGetter = desc.get;
                const self = this;
                Object.defineProperty(proto, 'gamepad', {
                    configurable: true,
                    enumerable: desc.enumerable,
                    get(this: GamepadEvent) {
                        const original = nativeGetter.call(this) as Gamepad;
                        return self.adaptOne(original) ?? original;
                    },
                });
            }
        } catch (e) {
            BxLogger.warning(this.LOG_TAG, 'No es pot parchejar GamepadEvent', e);
        }

        BxLogger.info(this.LOG_TAG, 'Instal·lat');
    }

    // ---------------------------------------------------------------- Configuració

    private refreshConfig(force = false) {
        const now = performance.now();
        if (!force && now - this.configTimestamp < CONFIG_REFRESH_MS) {
            return;
        }

        this.configTimestamp = now;
        try {
            this.config.enabled = !!getGlobalPref(GlobalPref.GAMEPAD_ADAPTER_ENABLED);
            this.config.swapFace = !!getGlobalPref(GlobalPref.GAMEPAD_ADAPTER_SWAP_FACE);
            this.config.deadzone = (getGlobalPref(GlobalPref.GAMEPAD_ADAPTER_DEADZONE) as number) / 100;
            this.config.remoteMode = getGlobalPref(GlobalPref.RELAY_VIEWER_MODE) as string;
        } catch (e) {}
    }

    isEnabled() {
        this.refreshConfig(true);
        return this.config.enabled;
    }

    // ---------------------------------------------------------------- Perfils

    private loadProfiles() {
        try {
            this.profiles = JSON.parse(window.localStorage.getItem(StorageKey.GAMEPAD_PROFILES) || '{}') || {};
        } catch (e) {
            this.profiles = {};
        }
    }

    private saveProfiles() {
        try {
            window.localStorage.setItem(StorageKey.GAMEPAD_PROFILES, JSON.stringify(this.profiles));
        } catch (e) {}
    }

    hasCustomProfile(key: string) {
        return key in this.profiles;
    }

    setProfile(key: string, profile: AdapterProfile) {
        this.profiles[key] = profile;
        this.saveProfiles();
    }

    resetProfile(key: string) {
        delete this.profiles[key];
        this.saveProfiles();
    }

    private getProfile(info: PhysicalInfo, gamepad: Gamepad): AdapterProfile {
        return this.profiles[info.key] || autoProfile(info, gamepad);
    }

    /** Evita traduir mentre l'assistent llegeix l'entrada crua. */
    setLearning(key: string, learning: boolean) {
        learning ? this.learningKeys.add(key) : this.learningKeys.delete(key);
    }

    // ---------------------------------------------------------------- Lectura del mando físic

    /** Mandos físics, sense adaptar (per a l'assistent d'assignació). */
    getPhysicalGamepads(): Gamepad[] {
        const list = (this.installed ? this.nativeGetGamepads() : window.navigator.getGamepads()) || [];
        const result: Gamepad[] = [];
        for (const gp of list) {
            if (gp?.connected) {
                result.push(gp);
            }
        }
        return result;
    }

    private static readSource(gp: Gamepad, src: SourceRef | null | undefined): number {
        if (!src) {
            return 0;
        }

        switch (src.t) {
            case 'b': {
                const b = gp.buttons[src.i];
                return b ? (b.value || (b.pressed ? 1 : 0)) : 0;
            }
            case 'a': {
                const v = gp.axes[src.i] ?? 0;
                return Math.max(0, v * src.d);
            }
            case 'tr': {
                const v = gp.axes[src.i];
                return v === undefined ? 0 : Math.max(0, Math.min(1, (v + 1) / 2));
            }
            case 'f': {
                const v = gp.axes[src.i] ?? 0;
                return src.inv ? -v : v;
            }
            case 'h': {
                const v = gp.axes[src.i];
                return v !== undefined && hatDirections(v)[src.d] ? 1 : 0;
            }
        }
    }

    // ---------------------------------------------------------------- Adaptació

    private patchedGetGamepads = (): ReturnType<Navigator['getGamepads']> => {
        const list = this.nativeGetGamepads();
        this.refreshConfig();

        const virtualOn = this.virtual.active;
        const remoteOn = this.remotes.size > 0;
        if ((!this.config.enabled && !virtualOn && !remoteOn) || !list) {
            return list;
        }

        const result: Array<Gamepad | null> = new Array(list.length);
        let mergeIndex = -1;
        for (let i = 0; i < list.length; i++) {
            const gp = this.config.enabled ? this.adaptOne(list[i] ?? null) : (list[i] ?? null);
            result[i] = gp as Gamepad | null;

            // Les fonts extra es fusionen amb el primer mando de layout estàndard
            if (mergeIndex < 0 && gp?.connected && gp.mapping === 'standard' && !gp.id.includes(VIRTUAL_PAD_ID)) {
                mergeIndex = i;
            }
        }

        // Fonts compartides: mando digital + espectadors (mode "comparteixen el jugador 1")
        const sources: Array<{ buttons: number[]; axes: number[] }> = [];
        virtualOn && sources.push(this.virtual);
        if (this.config.remoteMode !== 'players') {
            sources.push(...this.activeRemoteStates());
        }

        if (sources.length) {
            if (mergeIndex >= 0) {
                result[mergeIndex] = this.mergeSources(result[mergeIndex]!, mergeIndex, sources) as any;
                this.setStandalone(false);
            } else {
                this.fillFromSources(this.virtualGamepad, sources);
                this.virtualGamepad.timestamp = performance.now();
                result[0] = this.virtualGamepad as any;
                this.setStandalone(true);
            }
        } else {
            this.setStandalone(false);
        }

        // Mode "un jugador per espectador": cada espectador ocupa una ranura lliure
        if (this.config.remoteMode === 'players' && remoteOn) {
            this.assignRemotePlayers(result);
        }

        return result as any;
    };

    // ---------------------------------------------------------------- Mando digital (en pantalla)

    /** Estat que actualitza el mando digital (components 0..1; palanques -1..1). */
    readonly virtual = {
        active: false,
        buttons: new Array<number>(17).fill(0),
        axes: [0, 0, 0, 0],
    };

    private virtualGamepad = {
        id: VIRTUAL_PAD_ID,
        index: 0,
        connected: true,
        mapping: 'standard',
        timestamp: 0,
        axes: [0, 0, 0, 0],
        buttons: new Array(17).fill(null).map(() => ({ pressed: false, touched: false, value: 0 })),
        vibrationActuator: null,
        hapticActuators: null,
        _bxAdapted: true,
    };

    private merged: Record<number, any> = {};
    private standaloneConnected = false;

    setVirtualActive(active: boolean) {
        this.virtual.active = active;
        if (!active) {
            this.virtual.buttons.fill(0);
            this.virtual.axes.fill(0);
        }

        this.syncStandalone();
    }

    /** Hi ha algun mando físic (de layout estàndard o adaptat) connectat? */
    private hasPhysicalPad(): boolean {
        if (!this.installed) {
            return false;
        }

        for (const gp of this.nativeGetGamepads() || []) {
            if (gp?.connected && !gp.id.includes(VIRTUAL_PAD_ID) && (gp.mapping === 'standard' || this.config.enabled)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Connecta/desconnecta de seguida el mando "extra" (digital + espectadors compartits). Cal fer-ho aquí i no
     * només dins getGamepads(): xCloud no sondeja cap mando fins que n'hi ha un de connectat, així que
     * l'esdeveniment "gamepadconnected" ha de sortir quan la font s'activa.
     */
    private syncStandalone() {
        this.refreshConfig(true);
        const sharedRemotes = this.config.remoteMode !== 'players' && this.remotes.size > 0;
        this.setStandalone((this.virtual.active || sharedRemotes) && !this.hasPhysicalPad());
    }

    /** Avisa xCloud quan el mando digital passa a ser l'únic mando connectat (i viceversa). */
    private setStandalone(value: boolean) {
        if (value === this.standaloneConnected) {
            return;
        }

        this.standaloneConnected = value;
        this.virtualGamepad.connected = value;
        this.virtualGamepad.timestamp = performance.now();
        BxEvent.dispatch(window, value ? 'gamepadconnected' : 'gamepaddisconnected', {
            gamepad: this.virtualGamepad,
        });
    }

    private fillFromSources(target: { buttons: any[]; axes: number[] }, sources: Array<{ buttons: number[]; axes: number[] }>, base?: { buttons: any[]; axes: number[] }) {
        for (let i = 0; i < 17; i++) {
            let value = base?.buttons[i]?.value ?? 0;
            for (const src of sources) {
                value = Math.max(value, src.buttons[i] ?? 0);
            }

            const btn = target.buttons[i];
            btn.value = value;
            btn.pressed = value > 0.5;
            btn.touched = value > 0;
        }

        for (let i = 0; i < 4; i++) {
            let axis = base?.axes[i] ?? 0;
            for (const src of sources) {
                const v = src.axes[i] ?? 0;
                if (Math.abs(v) > Math.abs(axis)) axis = v;
            }
            target.axes[i] = axis;
        }
    }

    private mergeSources(gp: any, index: number, sources: Array<{ buttons: number[]; axes: number[] }>) {
        let out = this.merged[index];
        if (!out || out.id !== gp.id) {
            out = this.merged[index] = {
                id: gp.id, index: gp.index, connected: true, mapping: 'standard',
                axes: [0, 0, 0, 0],
                buttons: new Array(17).fill(null).map(() => ({ pressed: false, touched: false, value: 0 })),
                hapticActuators: null, vibrationActuator: null, _bxAdapted: true,
            };
        }

        out.timestamp = gp.timestamp;
        out.vibrationActuator = gp.vibrationActuator ?? null;
        this.fillFromSources(out, sources, gp);
        return out;
    }

    // ---------------------------------------------------------------- Espectadors remots (relé)

    /** Estat dels mandos dels espectadors, indexat per l'identificador que dona el relé. */
    readonly remotes = new Map<number, { buttons: number[]; axes: number[]; lastSeen: number }>();
    private remotePads = new Map<number, any>();
    private remoteSlots = new Map<number, number>();

    setRemoteInput(id: number, buttons: number[], axes: number[]) {
        const isNew = !this.remotes.has(id);
        this.remotes.set(id, { buttons, axes, lastSeen: performance.now() });

        if (isNew) {
            this.refreshConfig(true);
            this.config.remoteMode === 'players' ? this.ensureRemotePlayer(id) : this.syncStandalone();
        }
    }

    removeRemote(id: number) {
        this.remotes.delete(id);

        const pad = this.remotePads.get(id);
        if (pad && this.remoteSlots.has(id)) {
            pad.connected = false;
            BxEvent.dispatch(window, 'gamepaddisconnected', { gamepad: pad });
        }

        this.remotePads.delete(id);
        this.remoteSlots.delete(id);

        this.syncStandalone();
        this.restoreCoOp();
    }

    // ---- Cooperatiu local: perquè la consola vegi els espectadors com a jugadors reals (2, 3 i 4)

    private coOpForced = false;

    private enableCoOp() {
        if (this.coOpForced) {
            return;
        }

        this.coOpForced = true;
        (window as any).BX_EXPOSED?.toggleLocalCoOp?.(true);
        Toast.show(t('local-co-op'), t('enabled'), { instant: true });
    }

    /** Quan no queda cap espectador-jugador, es torna al valor que té configurat l'usuari. */
    private restoreCoOp() {
        if (!this.coOpForced || this.remoteSlots.size > 0) {
            return;
        }

        this.coOpForced = false;
        (window as any).BX_EXPOSED?.toggleLocalCoOp?.(!!getStreamPref(StreamPref.LOCAL_CO_OP_ENABLED));
    }

    /** Ranures (0..3) que ja ocupa algun mando: físics, el mando extra i altres espectadors. */
    private occupiedSlots(exceptId?: number): Set<number> {
        const used = new Set<number>();
        if (this.installed) {
            for (const gp of this.nativeGetGamepads() || []) {
                gp?.connected && !gp.id.includes(VIRTUAL_PAD_ID) && used.add(gp.index);
            }
        }

        this.remoteSlots.forEach((slot, id) => id !== exceptId && used.add(slot));
        return used;
    }

    private ensureRemotePlayer(id: number) {
        if (this.remoteSlots.has(id)) {
            return;
        }

        // Primer s'habilita el cooperatiu: així xCloud ja tracta l'índex de cada mando en rebre'l
        this.enableCoOp();

        const used = this.occupiedSlots(id);
        let slot = -1;
        for (let i = 0; i < 4; i++) {
            if (!used.has(i)) { slot = i; break; }
        }

        if (slot < 0) {
            return; // no queden ranures: la consola admet 4 mandos
        }

        const pad = {
            id: `${VIRTUAL_PAD_ID} Remote ${id}`, index: slot, connected: true, mapping: 'standard', timestamp: performance.now(),
            axes: [0, 0, 0, 0],
            buttons: new Array(17).fill(null).map(() => ({ pressed: false, touched: false, value: 0 })),
            vibrationActuator: null, hapticActuators: null, _bxAdapted: true,
        };

        this.remotePads.set(id, pad);
        this.remoteSlots.set(id, slot);
        BxEvent.dispatch(window, 'gamepadconnected', { gamepad: pad });
    }

    clearRemotes() {
        Array.from(this.remotes.keys()).forEach(id => this.removeRemote(id));
    }

    private static readonly NEUTRAL = { buttons: new Array<number>(17).fill(0), axes: [0, 0, 0, 0] };

    /** Un espectador amb la pestanya en segon pla (sense dades > 3 s) es considera en repòs. */
    private activeRemoteStates() {
        const now = performance.now();
        return Array.from(this.remotes.values()).map(r => now - r.lastSeen > 3000 ? GamepadAdapter.NEUTRAL : r);
    }

    private assignRemotePlayers(result: Array<Gamepad | null>) {
        const now = performance.now();
        const ids = Array.from(this.remotes.keys()).sort((x, y) => x - y);

        for (const id of ids) {
            this.ensureRemotePlayer(id); // per si encara no té ranura

            const pad = this.remotePads.get(id);
            let slot = this.remoteSlots.get(id);
            if (!pad || slot === undefined) {
                continue;
            }

            // Si un mando físic ha ocupat la ranura mentrestant, es busca una altra
            if (result[slot]?.connected && !result[slot]!.id.includes(VIRTUAL_PAD_ID)) {
                const used = this.occupiedSlots(id);
                result.forEach((gp, i) => gp?.connected && used.add(i));
                const free = [0, 1, 2, 3].find(i => !used.has(i));
                if (free === undefined) {
                    continue;
                }

                pad.connected = false;
                BxEvent.dispatch(window, 'gamepaddisconnected', { gamepad: pad });
                slot = free;
                pad.index = slot;
                pad.connected = true;
                this.remoteSlots.set(id, slot);
                BxEvent.dispatch(window, 'gamepadconnected', { gamepad: pad });
            }

            pad.timestamp = now;
            const state = this.remotes.get(id)!;
            this.fillFromSources(pad, [now - state.lastSeen > 3000 ? GamepadAdapter.NEUTRAL : state]);
            result[slot] = pad;
        }
    }

    private adaptOne(gp: Gamepad | null): Gamepad | AdaptedGamepad | null {
        if (!gp) {
            return gp;
        }

        // Ja adaptat o mando virtual del mòdul de ratolí i teclat
        if ((gp as any)._bxAdapted || gp.id.includes('xCloud Català')) {
            return gp;
        }

        this.refreshConfig();
        if (!this.config.enabled || !gp.connected) {
            return gp;
        }

        const info = getPhysicalInfo(gp);
        if (this.learningKeys.has(info.key)) {
            return gp;
        }

        let out = this.adapted[gp.index];
        if (!out || out.id !== gp.id) {
            out = {
                id: gp.id,
                index: gp.index,
                connected: true,
                mapping: 'standard',
                timestamp: gp.timestamp,
                axes: [0, 0, 0, 0],
                buttons: new Array(17).fill(null).map(() => ({ pressed: false, touched: false, value: 0 })),
                vibrationActuator: (gp as any).vibrationActuator ?? null,
                hapticActuators: (gp as any).hapticActuators ?? null,
                _bxAdapted: true,
                _bxPhysicalIndex: gp.index,
            };
            this.adapted[gp.index] = out;
        }

        out.connected = gp.connected;
        out.timestamp = gp.timestamp;
        out.vibrationActuator = (gp as any).vibrationActuator ?? null;

        // Els mandos ja estàndard només necessiten l'opció Nintendo
        const profile = gp.mapping === 'standard' && !this.hasCustomProfile(info.key) ? null : this.getProfile(info, gp);
        this.convert(gp, profile, out);

        return out;
    }

    private convert(gp: Gamepad, profile: AdapterProfile | null, out: AdaptedGamepad) {
        const { swapFace, deadzone } = this.config;

        // Botons
        for (let i = 0; i <= 16; i++) {
            let value: number;
            if (profile) {
                value = GamepadAdapter.readSource(gp, profile.buttons[i]);
            } else {
                const b = gp.buttons[i];
                value = b ? (b.value || (b.pressed ? 1 : 0)) : 0;
            }

            let target = i;
            if (swapFace) {
                // Disposició Nintendo: A↔B, X↔Y
                if (i === XKey.A) target = XKey.B;
                else if (i === XKey.B) target = XKey.A;
                else if (i === XKey.X) target = XKey.Y;
                else if (i === XKey.Y) target = XKey.X;
            }

            const btn = out.buttons[target]!;
            btn.value = value;
            btn.pressed = value > 0.5;
            btn.touched = value > 0;
        }

        // Palanques amb zona morta radial
        for (let stick = 0; stick < 2; stick++) {
            const xi = stick * 2;
            const yi = xi + 1;
            let x = profile ? GamepadAdapter.readSource(gp, profile.axes[xi]) : (gp.axes[xi] ?? 0);
            let y = profile ? GamepadAdapter.readSource(gp, profile.axes[yi]) : (gp.axes[yi] ?? 0);

            const mag = Math.hypot(x, y);
            if (mag < deadzone) {
                x = 0;
                y = 0;
            } else if (deadzone > 0) {
                const scaled = Math.min(1, (mag - deadzone) / (1 - deadzone));
                x = (x / mag) * scaled;
                y = (y / mag) * scaled;
            }

            out.axes[xi] = x;
            out.axes[yi] = y;
        }

        // Gallets analògics: si la font és digital, el valor ja és 0/1
        // (ja inclòs a la lectura dels botons LT/RT).
    }
}

export { identityProfile, cloneProfile };
