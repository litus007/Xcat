import { BxEventBus } from "@utils/bx-event-bus";
import { BxLogger } from "@utils/bx-logger";

/**
 * Evita que la pantalla s'apagui mentre hi ha una partida en curs (Screen Wake Lock API).
 */
export class ScreenWakeLock {
    private static sentinel: WakeLockSentinel | null = null;
    private static playing = false;

    static setup() {
        if (!('wakeLock' in navigator)) {
            return;
        }

        BxEventBus.Stream.on('state.playing', () => {
            ScreenWakeLock.playing = true;
            ScreenWakeLock.request();
        });

        BxEventBus.Stream.on('state.stopped', () => {
            ScreenWakeLock.playing = false;
            ScreenWakeLock.release();
        });

        // El navegador allibera el bloqueig en passar a segon pla: es torna a demanar en tornar
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && ScreenWakeLock.playing) {
                ScreenWakeLock.request();
            }
        });
    }

    private static async request() {
        if (ScreenWakeLock.sentinel && !ScreenWakeLock.sentinel.released) {
            return;
        }

        try {
            ScreenWakeLock.sentinel = await navigator.wakeLock.request('screen');
        } catch (e) {
            BxLogger.warning('ScreenWakeLock', 'No es pot bloquejar la pantalla', e);
        }
    }

    private static release() {
        ScreenWakeLock.sentinel?.release().catch(() => {});
        ScreenWakeLock.sentinel = null;
    }
}
