import { AppInterface } from "@utils/global";
import { BxLogger } from "./bx-logger";
import { BX_FLAGS } from "./bx-flags";


export namespace BxEvent {
    export const POPSTATE = 'bx-popstate';

    // export const STREAM_EVENT_TARGET_READY = 'bx-stream-event-target-ready';
    // Inside patch
    export const STREAM_SESSION_READY = 'bx-stream-session-ready';

    export const CUSTOM_TOUCH_LAYOUTS_LOADED = 'bx-custom-touch-layouts-loaded';
    export const TOUCH_LAYOUT_MANAGER_READY = 'bx-touch-layout-manager-ready';

    // Inside app
    // TODO: Use EventBus
    export const REMOTE_PLAY_READY = 'bx-remote-play-ready';
    export const REMOTE_PLAY_FAILED = 'bx-remote-play-failed';

    // Inside patch
    export const CAPTURE_SCREENSHOT = 'bx-capture-screenshot';

    export const POINTER_LOCK_REQUESTED = 'bx-pointer-lock-requested';
    export const POINTER_LOCK_EXITED = 'bx-pointer-lock-exited';

    // Inside patch
    export const NAVIGATION_FOCUS_CHANGED = 'bx-nav-focus-changed';

    export const XCLOUD_GUIDE_MENU_SHOWN = 'bx-xcloud-guide-menu-shown';

    export const XCLOUD_POLLING_MODE_CHANGED = 'bx-xcloud-polling-mode-changed';

    export const XCLOUD_RENDERING_COMPONENT = 'bx-xcloud-rendering-component';

    export const XCLOUD_ROUTER_HISTORY_READY = 'bx-xcloud-router-history-ready';

    export function dispatch(target: Element | Window | null, eventName: string, data?: any) {
        if (!target) {
            return;
        }

        if (!eventName) {
            alert('BxEvent.dispatch(): eventName is null');
            return;
        }

        const event = new Event(eventName);
        if (data) {
            for (const key in data) {
                (event as any)[key] = data[key];
            }
        }

        target.dispatchEvent(event);
        AppInterface && AppInterface.onEvent(eventName);

        BX_FLAGS.Debug && BxLogger.warning('BxEvent', 'dispatch', target, eventName, data);
    }
}

window.BxEvent = BxEvent;
