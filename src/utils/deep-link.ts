import { localRedirect } from "@/modules/ui/ui";
import { AppInterface } from "./global";
import { RemotePlayManager } from "@/modules/remote-play-manager";
import { BxEvent } from "./bx-event";


export function handleDeepLink() {
    const deepLinkData = JSON.parse(AppInterface.getDeepLinkData());
    if (!deepLinkData.host) {
        return;
    }

    const onReady = () => {
        if (deepLinkData.host === 'PLAY') {
            localRedirect('/launch/' + deepLinkData.data.join('/'));
        } else if (deepLinkData.host === 'DEVICE_CODE') {
            localRedirect('/login/deviceCode');
        } else if (deepLinkData.host === 'REMOTE_PLAY') {
            const serverId = deepLinkData.data[0];
            const resolution = deepLinkData.data[1] || '1080p';

            const manager = RemotePlayManager.getInstance();
            if (!manager) {
                return;
            }

            if (manager.isReady()) {
                manager.play(serverId, resolution);
                return;
            }

            window.addEventListener(BxEvent.REMOTE_PLAY_READY, () => {
                manager.play(serverId, resolution);
            });
        }
    }

    let handled = false
    const observer = new MutationObserver(mutationList => {
        mutationList.forEach(mutation => {
            if (handled || mutation.type !== 'childList') {
                return;
            }

            const $target = mutation.target as HTMLElement;
            if (!handled && $target.className && $target.className['startsWith'] && $target.className.includes('HomePage-module__homePage')) {
                handled = true;
                observer.disconnect();
                setTimeout(onReady, 1000);
                return;
            }
        });
    });
    observer.observe(document.documentElement, {subtree: true, childList: true});
}
