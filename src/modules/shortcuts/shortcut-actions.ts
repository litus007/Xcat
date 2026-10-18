import { GlobalPref } from "@/enums/pref-keys";
import { ShortcutAction } from "@/enums/shortcut-actions";
import { AppInterface, STATES } from "@/utils/global";
import { getGlobalPref } from "@/utils/pref-utils";
import { t } from "@/utils/translation";

type ShortcutActions = {
    [key: string]: {
        [key in ShortcutAction]?: string[];
    };
};

export const SHORTCUT_ACTIONS: ShortcutActions = {
    // Script
    [t('better-xcloud')]: {
        [ShortcutAction.BETTER_XCLOUD_SETTINGS_SHOW]: [t('settings'), t('show')],
    },

    // MKB
    ...(STATES.browser.capabilities.mkb ? {
        [t('mouse-and-keyboard')]: {
            [ShortcutAction.MKB_TOGGLE]: [t('toggle')],
        },
    } : {}),

    [t('controller')]: {
        [ShortcutAction.CONTROLLER_XBOX_BUTTON_PRESS]: [t('button-xbox'), t('press')],
    },

    // Device
    ...(!!AppInterface ? {
        [t('device')]: {
            [ShortcutAction.DEVICE_SOUND_TOGGLE]: [t('sound'), t('toggle')],
            [ShortcutAction.DEVICE_VOLUME_INC]: [t('volume'), t('increase')],
            [ShortcutAction.DEVICE_VOLUME_DEC]: [t('volume'), t('decrease')],

            [ShortcutAction.DEVICE_BRIGHTNESS_INC]: [t('brightness'), t('increase')],
            [ShortcutAction.DEVICE_BRIGHTNESS_DEC]: [t('brightness'), t('decrease')],
        },
    } : {}),

    // Stream
    [t('stream')]: {
        [ShortcutAction.STREAM_SCREENSHOT_CAPTURE]: [t('take-screenshot')],
        [ShortcutAction.STREAM_VIDEO_TOGGLE]: [t('video'), t('toggle')],

        [ShortcutAction.STREAM_SOUND_TOGGLE]: [t('sound'), t('toggle')],

        ...(getGlobalPref(GlobalPref.AUDIO_VOLUME_CONTROL_ENABLED) ? {
            [ShortcutAction.STREAM_VOLUME_INC]: [t('volume'), t('increase')],
            [ShortcutAction.STREAM_VOLUME_DEC]: [t('volume'), t('decrease')],
        } : {}),

        [ShortcutAction.STREAM_MENU_SHOW]: [t('menu'), t('show')],
        [ShortcutAction.STREAM_STATS_TOGGLE]: [t('stats'), t('show-hide')],
        [ShortcutAction.STREAM_MICROPHONE_TOGGLE]: [t('microphone'), t('toggle')],
    },

    // Other
    [t('other')]: {
        [ShortcutAction.TRUE_ACHIEVEMENTS_OPEN]: [t('true-achievements'), t('show')],
    },
} as const;
