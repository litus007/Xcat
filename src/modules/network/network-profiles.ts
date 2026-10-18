import { GlobalPref } from "@/enums/pref-keys";
import { BxEventBus } from "@utils/bx-event-bus";
import { BxLogger } from "@utils/bx-logger";
import { GlobalSettingsStorage } from "@utils/settings-storages/global-settings-storage";
import { getGlobalPref } from "@utils/pref-utils";
import { Toast } from "@utils/toast";
import { t } from "@utils/translation";

export type NetworkKind = 'wifi' | 'mobile';

/**
 * Perfils de qualitat per tipus de xarxa.
 * Aplica resolució i taxa de bits màxima diferents segons si el dispositiu usa Wi-Fi/cable o dades mòbils.
 * Els valors són temporals (overrides en memòria): la configuració desada no es toca.
 */
export class NetworkProfiles {
    private static readonly LOG_TAG = 'NetworkProfiles';
    private static current: NetworkKind | null = null;
    private static details = '';

    static setup() {
        NetworkProfiles.apply();

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
        if (!getGlobalPref(GlobalPref.NETWORK_PROFILES_ENABLED)) {
            GlobalSettingsStorage.setOverrides({});
            NetworkProfiles.current = null;
            return;
        }

        const kind = NetworkProfiles.detect();
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
