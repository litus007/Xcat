import { ButtonStyle, CE, createButton, escapeCssSelector } from "@/utils/html";
import { NavigationDialog, type NavigationElement } from "./navigation-dialog";
import { GlobalPref } from "@/enums/pref-keys";
import { BxIcon } from "@/utils/bx-icon";
import { getGlobalPref, setGlobalPref } from "@/utils/pref-utils";
import { t } from "@/utils/translation";
import { RemotePlayConsoleState, RemotePlayManager } from "@/modules/remote-play-manager";
import { BxSelectElement } from "@/web-components/bx-select";
import { BxEvent } from "@/utils/bx-event";
import { BxLogger } from "@/utils/bx-logger";
import { StreamResolution } from "@/enums/pref-values";
import { setNearby } from "@/utils/navigation-utils";
import { AppInterface } from "@/utils/global";
import { SettingElement } from "@/utils/setting-element";


export class RemotePlayDialog extends NavigationDialog {
    private static instance: RemotePlayDialog;
    public static getInstance = () => RemotePlayDialog.instance ?? (RemotePlayDialog.instance = new RemotePlayDialog());
    private readonly LOG_TAG = 'RemotePlayNavigationDialog';

    private readonly STATE_LABELS: Record<RemotePlayConsoleState, string> = {
        [RemotePlayConsoleState.ON]: t('powered-on'),
        [RemotePlayConsoleState.OFF]: t('powered-off'),
        [RemotePlayConsoleState.STANDBY]: t('standby'),
        [RemotePlayConsoleState.UNKNOWN]: t('unknown'),
    };

    $container!: HTMLElement;

    private constructor() {
        super();
        BxLogger.info(this.LOG_TAG, 'constructor()');
        this.setupDialog();
    }

    private setupDialog() {
        const $fragment = CE('div', { class: 'bx-centered-dialog' },
            CE('div', { class: 'bx-dialog-title' },
                CE('p', false, t('remote-play')),
            ),
        );

        const $settingNote = CE('p', {});

        const currentResolution = getGlobalPref(GlobalPref.REMOTE_PLAY_STREAM_RESOLUTION);
        let $resolutions : HTMLSelectElement | NavigationElement = CE('select', false,
            CE('option', { value: StreamResolution.DIM_720P }, '720p'),
            CE('option', { value: StreamResolution.DIM_1080P }, '1080p'),
            CE('option', { value: StreamResolution.DIM_1080P_HQ }, `1080p (HQ)`),
        );

        $resolutions = BxSelectElement.create($resolutions as HTMLSelectElement);
        $resolutions.addEventListener('input', (e: Event) => {
            const value = (e.target as HTMLSelectElement).value;

            $settingNote.textContent = `✅ ${t('xbox-360-games')} ${value === StreamResolution.DIM_1080P_HQ ? '❌' : '✅'} ${t('xbox-apps')}`;
            setGlobalPref(GlobalPref.REMOTE_PLAY_STREAM_RESOLUTION, value, 'ui');
        });

        ($resolutions as any).value = currentResolution;
        BxEvent.dispatch($resolutions, 'input', {
            manualTrigger: true,
        });

        const $qualitySettings = CE('div', {
            class: 'bx-remote-play-settings',
        }, CE('div', false,
            CE('label', false, t('target-resolution'), $settingNote),
            $resolutions,
        ), CE('div', false,
            CE('label', { 'for': `bx_setting_${escapeCssSelector(GlobalPref.REMOTE_PLAY_PREFER_IPV6)}` }, t('prefer-ipv6-server')),
            SettingElement.fromPref(GlobalPref.REMOTE_PLAY_PREFER_IPV6),
        ));

        $fragment.appendChild($qualitySettings);

        // Render consoles list
        const manager = RemotePlayManager.getInstance()!;
        const consoles = manager.getConsoles();

        const createConsoleShortcut = (e: Event) => {
            const { serverId, deviceName } = (e.target as HTMLElement).dataset;
            const optionsJson = JSON.stringify({
                'resolution': getGlobalPref(GlobalPref.REMOTE_PLAY_STREAM_RESOLUTION),
            });

            AppInterface?.createConsoleShortcut(serverId!, deviceName!, optionsJson);
        };

        for (let con of consoles) {
            let $connect;
            const $child = CE('div', {
                    class: 'bx-remote-play-device-wrapper',
                },
                CE('div', { class: 'bx-remote-play-device-info' },
                    CE('div', false,
                        CE('span', { class: 'bx-remote-play-device-name' }, con.deviceName),
                        CE('span', { class: 'bx-remote-play-console-type' }, con.consoleType.replace('Xbox', ''))
                    ),
                    CE('div', { class: 'bx-remote-play-power-state' }, this.STATE_LABELS[con.powerState]),
                ),

                // Shortcut button
                AppInterface ? createButton({
                    attributes: {
                        'data-server-id': con.serverId,
                        'data-device-name': con.deviceName,
                    },
                    icon: BxIcon.CREATE_SHORTCUT,
                    style: ButtonStyle.GHOST | ButtonStyle.FOCUSABLE,
                    title: t('create-shortcut'),
                    onClick: createConsoleShortcut,
                }) : null,

                // Connect button
                $connect = createButton({
                    classes: ['bx-remote-play-connect-button'],
                    label: t('console-connect'),
                    style: ButtonStyle.PRIMARY | ButtonStyle.FOCUSABLE,
                    onClick: e => manager.play(con.serverId),
                }),
            );

            setNearby($child, {
                orientation: 'horizontal',
                focus: $connect,
            })
            $fragment.appendChild($child);
        }

        // Add buttons
        $fragment.appendChild(
            CE('div', {
                class: 'bx-remote-play-buttons',
                _nearby: {
                    orientation: 'horizontal',
                },
            },
                createButton({
                    style: ButtonStyle.GHOST | ButtonStyle.FOCUSABLE,
                    label: t('close'),
                    onClick: e => this.hide(),
                }),
            ),
        );

        this.$container = $fragment;
    }

    getDialog(): NavigationDialog {
        return this;
    }

    getContent(): HTMLElement {
        return this.$container;
    }

    focusIfNeeded(): void {
        const $btnConnect = this.$container.querySelector<HTMLElement>('.bx-remote-play-device-wrapper button:last-of-type');
        $btnConnect && $btnConnect.focus();
    }
}
