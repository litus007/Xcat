import type { BxStates } from "@/types/states";
import { UserAgent } from "./user-agent";

export const SCRIPT_VERSION = Bun.env.SCRIPT_VERSION!;
export const SCRIPT_VARIANT = Bun.env.BUILD_VARIANT! as BuildVariant;

export const AppInterface = window.AppInterface;

UserAgent.init();
const userAgent = window.navigator.userAgent.toLowerCase();

const isTv = userAgent.includes('smart-tv') || userAgent.includes('smarttv') || /\baft.*\b/.test(userAgent);
const isVr = window.navigator.userAgent.includes('VR') && window.navigator.userAgent.includes('OculusBrowser');
const browserHasTouchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const userAgentHasTouchSupport = !isTv && !isVr && browserHasTouchSupport;

export const STATES: BxStates = {
    supportedRegion: true,
    serverRegions: {},
    selectedRegion: {},
    gsToken: '',
    isSignedIn: false,

    isPlaying: false,

    browser: {
        capabilities: {
            touch: browserHasTouchSupport,
            batteryApi: 'getBattery' in window.navigator,
            deviceVibration: !!window.navigator.vibrate,
            mkb: AppInterface || !UserAgent.getDefault().toLowerCase().match(/(android|iphone|ipad)/),
            emulatedNativeMkb: !!AppInterface,
        },
    },

    userAgent: {
        isTv: isTv,
        capabilities: {
            touch: userAgentHasTouchSupport,
            mkb: AppInterface || !userAgent.match(/(android|iphone|ipad)/),
        }
    },

    currentStream: {},
    remotePlay: {},

    pointerServerPort: 9269,
};

export function deepClone(obj: any): typeof obj | {} {
    if (!obj) {
        return {};
    }

    if ('structuredClone' in window) {
        return structuredClone(obj);
    }

    return JSON.parse(JSON.stringify(obj));
}
