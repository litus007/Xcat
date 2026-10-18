import { ShortcutAction } from "@/enums/shortcut-actions";
import { MicrophoneShortcut } from "@/modules/shortcuts/microphone-shortcut";
import { SoundShortcut } from "@/modules/shortcuts/sound-shortcut";
import { StreamUiShortcut } from "@/modules/shortcuts/stream-ui-shortcut";
import { StreamStats } from "@/modules/stream/stream-stats";
import { SettingsDialog } from "@/modules/ui/dialog/settings-dialog";
import { AppInterface, STATES } from "./global";
import { ScreenshotManager } from "./screenshot-manager";
import { EmulatedMkbHandler } from "@/modules/mkb/mkb-handler";
import { RendererShortcut } from "@/modules/shortcuts/renderer-shortcut";
import { TrueAchievements } from "./true-achievements";
import { NativeMkbHandler } from "@/modules/mkb/native-mkb-handler";
import { VirtualControllerShortcut } from "@/modules/shortcuts/virtual-controller-shortcut";

export class ShortcutHandler {
    static runAction(action: ShortcutAction) {
        switch (action) {
            case ShortcutAction.BETTER_XCLOUD_SETTINGS_SHOW:
                SettingsDialog.getInstance().show();
                break;

            case ShortcutAction.STREAM_SCREENSHOT_CAPTURE:
                ScreenshotManager.getInstance().takeScreenshot();
                break;

            case ShortcutAction.STREAM_VIDEO_TOGGLE:
                RendererShortcut.toggleVisibility();
                break;

            case ShortcutAction.STREAM_STATS_TOGGLE:
                StreamStats.getInstance().toggle();
                break;

            case ShortcutAction.STREAM_MICROPHONE_TOGGLE:
                MicrophoneShortcut.toggle();
                break;

            case ShortcutAction.STREAM_MENU_SHOW:
                StreamUiShortcut.showHideStreamMenu();
                break;

            case ShortcutAction.STREAM_SOUND_TOGGLE:
                SoundShortcut.muteUnmute();
                break;

            case ShortcutAction.STREAM_VOLUME_INC:
                SoundShortcut.adjustGainNodeVolume(10);
                break;

            case ShortcutAction.STREAM_VOLUME_DEC:
                SoundShortcut.adjustGainNodeVolume(-10);
                break;

            case ShortcutAction.DEVICE_BRIGHTNESS_INC:
            case ShortcutAction.DEVICE_BRIGHTNESS_DEC:
            case ShortcutAction.DEVICE_SOUND_TOGGLE:
            case ShortcutAction.DEVICE_VOLUME_INC:
            case ShortcutAction.DEVICE_VOLUME_DEC:
                AppInterface && AppInterface.runShortcut && AppInterface.runShortcut(action);
                break;

            case ShortcutAction.MKB_TOGGLE:
                if (STATES.currentStream.titleInfo?.details.hasMkbSupport) {
                    NativeMkbHandler.getInstance()?.toggle();
                } else {
                    EmulatedMkbHandler.getInstance()?.toggle();
                }
                break;

            case ShortcutAction.TRUE_ACHIEVEMENTS_OPEN:
                TrueAchievements.getInstance().open(false);
                break;

            case ShortcutAction.CONTROLLER_XBOX_BUTTON_PRESS:
                VirtualControllerShortcut.pressXboxButton();
                break;
        }
    }
}
