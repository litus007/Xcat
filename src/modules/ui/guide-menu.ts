import { AppInterface, STATES } from "@/utils/global";
import { createButton, ButtonStyle, CE } from "@/utils/html";
import { t } from "@/utils/translation";
import { SettingsDialog } from "./dialog/settings-dialog";
import { BxIcon } from "@/utils/bx-icon";
import { BxEventBus } from "@/utils/bx-event-bus";
import { getGlobalPref } from "@/utils/pref-utils";
import { UiLayout } from "@/enums/pref-values";
import { GlobalPref } from "@/enums/pref-keys";

export enum GuideMenuTab {
    HOME = 'home',
}

export class GuideMenu {
    private static instance: GuideMenu;
    public static getInstance = () => GuideMenu.instance ?? (GuideMenu.instance = new GuideMenu());

    private $renderedButtons?: HTMLElement;

    closeGuideMenu() {
        if (window.BX_EXPOSED.dialogRoutes) {
            window.BX_EXPOSED.dialogRoutes.closeAll();
            return;
        }

        // Use alternative method for Lite version
        const $btnClose = document.querySelector<HTMLElement>('#gamepass-dialog-root button[class^=Header-module__closeButton]');
        $btnClose && $btnClose.click();
    }

    private renderButtons() {
        if (this.$renderedButtons) {
            return this.$renderedButtons;
        }

        const buttons = {
            scriptSettings: createButton({
                label: t('better-xcloud'),
                icon: BxIcon.BETTER_XCLOUD,
                style: ButtonStyle.FULL_WIDTH | ButtonStyle.FOCUSABLE | ButtonStyle.PRIMARY,
                onClick: () => {
                    // Wait until the Guide dialog is closed
                    BxEventBus.Script.once('dialog.dismissed', () => {
                        setTimeout(() => SettingsDialog.getInstance().show(), 50);
                    });

                    // Close all xCloud's dialogs
                    this.closeGuideMenu();
                },
            }),

            closeApp: AppInterface && createButton({
                icon: BxIcon.POWER,
                label: t('close-app'),
                title: t('close-app'),
                style: ButtonStyle.FULL_WIDTH | ButtonStyle.FOCUSABLE | ButtonStyle.DANGER,
                onClick: e => {
                    AppInterface.closeApp();
                },

                attributes: {
                    'data-state': 'normal',
                },
            }),

            reloadPage: createButton({
                icon: BxIcon.REFRESH,
                label: t('reload-page'),
                title: t('reload-page'),
                style: ButtonStyle.FULL_WIDTH | ButtonStyle.FOCUSABLE,
                onClick: () => {
                    // Close all xCloud's dialogs
                    this.closeGuideMenu();

                    if (STATES.isPlaying) {
                        confirm(t('confirm-reload-stream')) && window.location.reload();
                    } else {
                        window.location.reload();
                    }
                },
            }),

            backToHome: createButton({
                icon: BxIcon.HOME,
                label: t('back-to-home'),
                title: t('back-to-home'),
                style: ButtonStyle.FULL_WIDTH | ButtonStyle.FOCUSABLE,
                onClick: () => {
                    // Close all xCloud's dialogs
                    this.closeGuideMenu();

                    confirm(t('back-to-home-confirm')) && (window.location.href = window.location.href.substring(0, 31));
                },
                attributes: {
                    'data-state': 'playing',
                },
            }),
        };

        const buttonsLayout = [
            buttons.scriptSettings,
            [
                buttons.backToHome,
                buttons.reloadPage,
                buttons.closeApp,
            ],
        ];

        const $div = CE('div', {
            class: 'bx-guide-home-buttons',
        });

        // Set TV tag
        if (STATES.userAgent.isTv || getGlobalPref(GlobalPref.UI_LAYOUT) === UiLayout.TV) {
            document.body.dataset.bxMediaType = 'tv';
        }

        for (const $button of buttonsLayout) {
            if (!$button) {
                continue;
            }

            if ($button instanceof HTMLElement) {
                $div.appendChild($button);
            } else if (Array.isArray($button)) {
                const $wrapper = CE('div', {});
                for (const $child of $button) {
                    $child && $wrapper.appendChild($child);
                }
                $div.appendChild($wrapper);
            }
        }

        this.$renderedButtons = $div;
        return $div;
    }

    injectHome($root: HTMLElement, isPlaying = false) {
        const $buttons = this.renderButtons();
        if ($root.contains($buttons)) {
            return;
        }

        // Find the element to add buttons to
        let $target: HTMLElement | null = null;
        if (isPlaying) {
            // Quit button
            $target = $root.querySelector('a[class*=QuitGameButton]');

            // Hide xCloud's Home button
            const $btnXcloudHome = $root.querySelector<HTMLElement>('div[class^=HomeButtonWithDivider]');
            $btnXcloudHome && ($btnXcloudHome.style.display = 'none');
        } else {
            // Last divider
            const $dividers = $root.querySelectorAll('div[class*=Divider-module__divider]');
            if ($dividers) {
                $target = $dividers[$dividers.length - 1] as HTMLElement;
            }
        }

        if (!$target) {
            return false;
        }

        $buttons.dataset.isPlaying = isPlaying.toString();
        $target.insertAdjacentElement('afterend', $buttons);
    }
}
