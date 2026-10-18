import { BxEvent } from "@utils/bx-event";
import { LoadingScreen } from "@modules/loading-screen";
import { BxEventBus } from "./bx-event-bus";
import { NavigationDialogManager } from "@/modules/ui/dialog/navigation-dialog";

export function patchHistoryMethod(type: 'pushState' | 'replaceState') {
    const orig = window.history[type];

    return function(...args: any[]) {
        BxEvent.dispatch(window, BxEvent.POPSTATE, {
            arguments: args,
        });

        // @ts-ignore
        return orig.apply(this, arguments);
    };
};


export function onHistoryChanged(e: PopStateEvent) {
    // @ts-ignore
    if (e && e.arguments && e.arguments[0] && e.arguments[0].origin === 'xcloud-catala') {
        return;
    }

    // Hide Navigation dialog
    NavigationDialogManager.getInstance().hide();

    LoadingScreen.reset();
    BxEventBus.Stream.emit('state.stopped', {});
}
