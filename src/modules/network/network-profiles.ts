import { GlobalPref } from "@/enums/pref-keys";
import { BxEventBus } from "@utils/bx-event-bus";
import { BxLogger } from "@utils/bx-logger";
import { GlobalSettingsStorage } from "@utils/settings-storages/global-settings-storage";
import { getGlobalPref } from "@utils/pref-utils";
import { Toast } from "@utils/toast";
import { t } from "@utils/translation";

export type NetworkKind = 'wifi' | 'mobile';
export type GameProfileMode = 'auto' | 'wifi' | 'mobile' | 'off';

const GAME_PROFILES_KEY = 'BetterXcloud.NetworkGameProfiles';

/**
 * Perfils de qualitat per tipus de xarxa.
 * Aplica resolució i taxa de bits màxima diferents segons si el dispositiu usa Wi-Fi/cable o dades mòbils.
 * Els valors són temporals (overrides en memòria): la configuració desada no es toca.
 */
export class NetworkProfiles {
    private static readonly LOG_TAG = 'NetworkProfiles';
    private static current: NetworkKind | null = null;
    private static details = '';
    private static applying = false;
    private static lastPath = '';

    /** Identificador del joc segons la URL de la partida: /play/launch/<slug>/<productId> */
    static getCurrentProductId(): string | null {
        const m = window.location.pathname.match(/\/launch\/[^/]+\/([^/?#]+)/);
        return m ? m[1]! : null;
    }

    private static readGameProfiles(): Record<string, GameProfileMode> {
        try {
            return JSON.parse(window.localStorage.getItem(GAME_PROFILES_KEY) || '{}') || {};
        } catch (e) {
            return {};
        }
    }

    static getGameProfile(productId: string): GameProfileMode {
        return NetworkProfiles.readGameProfiles()[productId] || 'auto';
    }

    static setGameProfile(productId: string, mode: GameProfileMode) {
        const all = NetworkProfiles.readGameProfiles();
        if (mode === 'auto') {
            delete all[productId];
        } else {
            all[productId] = mode;
        }

        try {
            window.localStorage.setItem(GAME_PROFILES_KEY, JSON.stringify(all));
        } catch (e) {}

        NetworkProfiles.apply();
    }

    static setup() {
        NetworkProfiles.apply();

        // L'app és una SPA: en canviar de joc cal recalcular el perfil abans que es llegeixin els valors
        GlobalSettingsStorage.onBeforeOverrideRead = () => {
            if (!NetworkProfiles.applying && window.location.pathname !== NetworkProfiles.lastPath) {
                NetworkProfiles.apply();
            }
        };

        const connection = (navigator as any).connection;
        connection?.addEventListener?.('change', () => NetworkProfiles.apply());

        // Si l'usuari canvia un paràmetre del perfil, es torna a calcular
        BxEventBus.Script.on('setting.changed', ({ settingKey }) => {
            if (String(settingKey).startsWith('network.profile')) {
                NetworkProfiles.apply();
            }
        });

        BxEventBus.Stream.on('state.playing', () => {
            if (NetworkProfiles.current && NetworkProfiles.details) {
                const profile = t(NetworkProfiles.current === 'mobile' ? 'network-profile-mobile' : 'network-profile-wifi');
                Toast.show(t('network-profile-applied', { profile, details: NetworkProfiles.details }), '📶');
            }
        });
    }

    /** Detecta el tipus de xarxa amb la Network Information API (no disponible a tots els navegadors). */
    static detect(): NetworkKind | null {
        const c = (navigator as any).connection;
        if (!c) {
            return null;
        }

        if (c.type === 'cellular') {
            return 'mobile';
        }

        if (c.type === 'wifi' || c.type === 'ethernet') {
            return 'wifi';
        }

        if (c.saveData || ['slow-2g', '2g', '3g'].includes(c.effectiveType)) {
            return 'mobile';
        }

        return c.effectiveType ? 'wifi' : null;
    }

    static apply() {
        // Evita recursió: llegir les preferències passa per getSetting, que torna a cridar apply()
        if (NetworkProfiles.applying) {
            return;
        }

        NetworkProfiles.applying = true;
        try {
            NetworkProfiles.compute();
        } finally {
            NetworkProfiles.applying = false;
            NetworkProfiles.lastPath = window.location.pathname;
        }
    }

    private static compute() {
        if (!getGlobalPref(GlobalPref.NETWORK_PROFILES_ENABLED)) {
            GlobalSettingsStorage.setOverrides({});
            NetworkProfiles.current = null;
            return;
        }

        // Perfil assignat a aquest joc (si n'hi ha)
        const productId = NetworkProfiles.getCurrentProductId();
        const mode = productId ? NetworkProfiles.getGameProfile(productId) : 'auto';

        let kind: NetworkKind | null;
        if (mode === 'off') {
            kind = null;
        } else if (mode === 'wifi' || mode === 'mobile') {
            kind = mode;
        } else {
            kind = NetworkProfiles.detect();
        }

        NetworkProfiles.current = kind;
        if (!kind) {
            GlobalSettingsStorage.setOverrides({});
            return;
        }

        const resolution = getGlobalPref(kind === 'mobile' ? GlobalPref.NETWORK_PROFILE_MOBILE_RESOLUTION : GlobalPref.NETWORK_PROFILE_WIFI_RESOLUTION) as string;
        const bitrateMb = getGlobalPref(kind === 'mobile' ? GlobalPref.NETWORK_PROFILE_MOBILE_BITRATE : GlobalPref.NETWORK_PROFILE_WIFI_BITRATE) as number;

        const overrides: Partial<Record<GlobalPref, any>> = {};
        const details: string[] = [];

        if (resolution && resolution !== 'default') {
            overrides[GlobalPref.STREAM_RESOLUTION] = resolution;
            overrides[GlobalPref.REMOTE_PLAY_STREAM_RESOLUTION] = resolution;
            details.push(resolution);
        }

        // 15 Mb/s és el màxim de l'escala i equival a "sense límit"
        if (bitrateMb > 0 && bitrateMb < 15) {
            overrides[GlobalPref.STREAM_MAX_VIDEO_BITRATE] = bitrateMb * 1024 * 1000;
            details.push(`${bitrateMb} Mb/s`);
        }

        NetworkProfiles.details = details.join(' · ');
        GlobalSettingsStorage.setOverrides(overrides);
        BxLogger.info(NetworkProfiles.LOG_TAG, kind, overrides);
    }
}
