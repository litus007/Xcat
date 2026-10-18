import { ShortcutHandler } from "@/utils/shortcut-handler";
import { KeyHelper } from "./key-helper";

export class KeyboardShortcutHandler {
    private static instance: KeyboardShortcutHandler;
    public static getInstance = () => KeyboardShortcutHandler.instance ?? (KeyboardShortcutHandler.instance = new KeyboardShortcutHandler());

    start() {
        window.addEventListener('keydown', this.onKeyDown);
    }

    stop() {
        window.removeEventListener('keydown', this.onKeyDown);
    }

    onKeyDown = (e: KeyboardEvent) => {
        // Don't run when the stream is not being focused
        if (window.BX_STREAM_SETTINGS.xCloudPollingMode !== 'none') {
            return;
        }

        // Don't activate repeated key
        if (e.repeat) {
            return;
        }

        // Check unknown key
        const fullKeyCode = KeyHelper.getFullKeyCodeFromEvent(e);
        if (!fullKeyCode) {
            return;
        }

        const action = window.BX_STREAM_SETTINGS.keyboardShortcuts?.[fullKeyCode];
        if (action) {
            e.preventDefault();
            e.stopPropagation();
            ShortcutHandler.runAction(action);
        }
    }
}
