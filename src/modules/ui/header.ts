import { isFullVersion } from "@macros/build" with { type: "macro" };

import { STATES } from "@utils/global";
import { createButton, ButtonStyle, CE } from "@utils/html";
import { BxIcon } from "@utils/bx-icon";
import { getPreferredServerRegion } from "@utils/region";
import { RemotePlayManager } from "@/modules/remote-play-manager";
import { t } from "@utils/translation";
import { SettingsDialog } from "./dialog/settings-dialog";
import { GlobalPref } from "@/enums/pref-keys";
import { getGlobalPref } from "@/utils/pref-utils";
import { BxLogger } from "@/utils/bx-logger";
import { BxEventBus } from "@/utils/bx-event-bus";
import { BlockFeature } from "@/enums/pref-values";
import { Toast } from "@/utils/toast";

export class HeaderSection {
    private static instance: HeaderSection;
    public static getInstance = () => HeaderSection.instance ?? (HeaderSection.instance = new HeaderSection());
    private readonly LOG_TAG = 'HeaderSection';

    private $btnRemotePlay: HTMLElement | null;
    private $btnSettings: HTMLElement;
    private $buttonsWrapper: HTMLElement;

    constructor() {
        BxLogger.info(this.LOG_TAG, 'constructor()');

        if (isFullVersion()) {
            this.$btnRemotePlay = createButton({
                classes: ['bx-header-remote-play-button', 'bx-gone'],
                icon: BxIcon.REMOTE_PLAY,
                title: t('remote-play'),
                style: ButtonStyle.GHOST | ButtonStyle.FOCUSABLE | ButtonStyle.CIRCULAR,
                onClick: e => RemotePlayManager.getInstance()?.togglePopup(),
            });
        } else {
            this.$btnRemotePlay = null;
        }

        let $btnSettings = this.$btnSettings = createButton({
            classes: ['bx-header-settings-button', 'bx-gone'],
            label: t('better-xcloud'),
            style: ButtonStyle.FROSTED | ButtonStyle.DROP_SHADOW | ButtonStyle.FOCUSABLE | ButtonStyle.FULL_HEIGHT,
            onClick: e => SettingsDialog.getInstance().show(),
        });

        this.$buttonsWrapper = CE('div', false,
            !getGlobalPref(GlobalPref.BLOCK_FEATURES).includes(BlockFeature.REMOTE_PLAY) ? this.$btnRemotePlay : null,
            this.$btnSettings,
        );

        BxEventBus.Script.on('xcloud.server', ({status}) => {
            if (status === 'ready') {
                STATES.isSignedIn = true;

                // Show server name
                $btnSettings.querySelector('span')!.textContent = getPreferredServerRegion(true) || t('better-xcloud');
            } else if (status === 'error') {
                Toast.show(t('server-list-error'), '❌', { instant: true });
            } else if (status === 'unavailable') {
                STATES.supportedRegion = false;

                // Open Settings dialog on Unsupported page
                const $unsupportedPage = document.querySelector<HTMLElement>('div[class^=UnsupportedMarketPage-module__container]');
                if ($unsupportedPage) {
                    SettingsDialog.getInstance().show();
                }
            }

            $btnSettings.classList.remove('bx-gone');
        });
    }

    checkHeader = () => {
        const $header = document.querySelector('#gamepass-root header[class^=Header-module__header]');
        if (!$header) {
            return;
        }

        let $target = $header.querySelector('div[class*=EdgewaterHeader-module__rightSectionSpacing], div[class*=RemotePlayHeader-module__rightSectionSpacing]');
        if (!$target) {
            $target = document.querySelector('div[class^=UnsupportedMarketPage-module__buttons]');
        }

        // Add the Settings button to the web page
        $target?.appendChild(this.$buttonsWrapper);

        if (!STATES.isSignedIn) {
            BxEventBus.Script.emit('xcloud.server', { status: 'signed-out' });
        }
    }

    showRemotePlayButton() {
        this.$btnRemotePlay?.classList.remove('bx-gone');
    }
}
