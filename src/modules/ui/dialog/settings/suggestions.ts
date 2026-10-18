import { GlobalPref, StreamPref, type AnyPref } from "@/enums/pref-keys";
import { BxEvent } from "@/utils/bx-event";
import { BX_FLAGS } from "@/utils/bx-flags";
import { CE, removeChildElements, createButton, ButtonStyle, escapeCssSelector } from "@/utils/html";
import type { BxHtmlSettingElement } from "@/utils/setting-element";
import { t } from "@/utils/translation";
import { BxSelectElement } from "@/web-components/bx-select";
import type { SettingsDialog } from "../settings-dialog";
import type { SuggestedSettingProfile } from "@/types/setting-definition";
import { DeviceVibrationMode, TouchControllerMode } from "@/enums/pref-values";
import { STORAGE, getPrefInfo, setPref } from "@/utils/pref-utils";
import { SettingsManager } from "@/modules/settings-manager";

export class SuggestionsSetting {
    static async renderSuggestions(this: SettingsDialog, e: Event) {
        const $btnSuggest = (e.target as HTMLElement).closest('div')!;
        $btnSuggest.toggleAttribute('bx-open');

        let $content = $btnSuggest.nextElementSibling as HTMLElement;
        if ($content) {
            BxEvent.dispatch($content.querySelector('select'), 'input');
            return;
        }

        // Get labels
        let settingTabGroup: keyof typeof this.SETTINGS_UI;
        for (settingTabGroup in this.SETTINGS_UI) {
            const settingTab = this.SETTINGS_UI[settingTabGroup];

            if (!settingTab || !settingTab.items || typeof settingTab.items === 'function') {
                continue;
            }

            for (const settingTabContent of settingTab.items) {
                if (!settingTabContent || settingTabContent instanceof HTMLElement || !settingTabContent.items) {
                    continue;
                }

                for (const setting of settingTabContent.items) {
                    let prefKey: AnyPref | undefined;

                    if (typeof setting === 'string') {
                        prefKey = setting;
                    } else if (typeof setting === 'object') {
                        prefKey = setting.pref as GlobalPref;
                    }

                    if (prefKey) {
                        this.settingLabels[prefKey] = settingTabContent.label;
                    }
                }
            }
        }

        // Get recommended settings for Android devices
        let recommendedDevice: string | null = '';

        if (BX_FLAGS.DeviceInfo.deviceType.includes('android')) {
            if (BX_FLAGS.DeviceInfo.androidInfo) {
                recommendedDevice = await SuggestionsSetting.getRecommendedSettings.call(this, BX_FLAGS.DeviceInfo.androidInfo);
            }
        }

        /*
        recommendedDevice = await this.getRecommendedSettings({
            manufacturer: 'Lenovo',
            board: 'kona',
            model: 'Lenovo TB-9707F',
        });
        */

        const hasRecommendedSettings = Object.keys(this.suggestedSettings.recommended).length > 0;

        // Add some specific setings based on device type
        const deviceType = BX_FLAGS.DeviceInfo.deviceType;
        if (deviceType === 'android-handheld') {
            // Disable touch
            SuggestionsSetting.addDefaultSuggestedSetting.call(this, GlobalPref.TOUCH_CONTROLLER_MODE, TouchControllerMode.OFF);
            // Enable device vibration
            SuggestionsSetting.addDefaultSuggestedSetting.call(this, StreamPref.DEVICE_VIBRATION_MODE, DeviceVibrationMode.ON);
        } else if (deviceType === 'android') {
            // Enable device vibration
            SuggestionsSetting.addDefaultSuggestedSetting.call(this, StreamPref.DEVICE_VIBRATION_MODE, DeviceVibrationMode.AUTO);
        } else if (deviceType === 'android-tv') {
            // Disable touch
            SuggestionsSetting.addDefaultSuggestedSetting.call(this, GlobalPref.TOUCH_CONTROLLER_MODE, TouchControllerMode.OFF);
        }

        // Set value for Default profile
        SuggestionsSetting.generateDefaultSuggestedSettings.call(this);

        // Start rendering
        const $suggestedSettings = CE('div', { class: 'bx-suggest-wrapper' });
        const $select = CE('select', false,
            hasRecommendedSettings && CE('option', { value: 'recommended' }, t('recommended')),
            !hasRecommendedSettings && CE('option', { value: 'highest' }, t('highest-quality')),
            CE('option', { value: 'default' }, t('default')),
            CE('option', { value: 'lowest' }, t('lowest-quality')),
        );
        $select.addEventListener('input', e => {
            const profile = $select.value as SuggestedSettingProfile;

            // Empty children
            removeChildElements($suggestedSettings);
            const fragment = document.createDocumentFragment();

            let note: HTMLElement | string | undefined;
            if (profile === 'recommended') {
                note = t('recommended-settings-for-device', { device: recommendedDevice });
            } else if (profile === 'highest') {
                // Add note for "Highest quality" profile
                note = '⚠️ ' + t('highest-quality-note');
            }

            note && fragment.appendChild(CE('div', { class: 'bx-suggest-note' }, note));

            const settings = this.suggestedSettings[profile];
            for (const key in settings) {
                const { storage, definition } = getPrefInfo(key as AnyPref);

                let prefKey;
                if (storage === STORAGE.Stream) {
                    prefKey = key as StreamPref;
                } else {
                    prefKey = key as GlobalPref;
                }

                let suggestedValue;
                if (definition && definition.transformValue) {
                    suggestedValue = definition.transformValue.get.call(definition, settings[prefKey]);
                } else {
                    suggestedValue = settings[prefKey];
                }

                // @ts-ignore
                const currentValue = storage.getSetting(prefKey, false);
                // @ts-ignore
                const currentValueText = storage.getValueText(prefKey, currentValue);
                const isSameValue = currentValue === suggestedValue;

                let $child: HTMLElement;
                let $value: HTMLElement | string;
                if (isSameValue) {
                    // No changes
                    $value = currentValueText;
                } else {
                    // @ts-ignore
                    const suggestedValueText = storage.getValueText(prefKey, suggestedValue);
                    $value = currentValueText + ' ➔ ' + suggestedValueText;
                }

                let $checkbox: HTMLInputElement;
                // @ts-ignore
                const breadcrumb = this.settingLabels[prefKey] + ' ❯ ' + storage.getLabel(prefKey);
                const id = escapeCssSelector(`bx_suggest_${prefKey}`);

                $child = CE('div', {
                    class: `bx-suggest-row ${isSameValue ? 'bx-suggest-ok' : 'bx-suggest-change'}`,
                },
                    $checkbox = CE('input', {
                        type: 'checkbox',
                        tabindex: 0,
                        checked: true,
                        id: id,
                    }),
                    CE('label', {
                        for: id,
                    },
                        CE('div', {
                            class: 'bx-suggest-label',
                        }, breadcrumb),
                        CE('div', {
                            class: 'bx-suggest-value',
                        }, $value),
                    ),
                );

                if (isSameValue) {
                    $checkbox.disabled = true;
                    $checkbox.checked = true;
                }

                fragment.appendChild($child);
            }

            $suggestedSettings.appendChild(fragment);
        });

        BxEvent.dispatch($select, 'input');

        const onClickApply = () => {
            const profile = $select.value as SuggestedSettingProfile;
            const settings = this.suggestedSettings[profile];

            let prefKey: AnyPref;
            const settingsManager = SettingsManager.getInstance();
            for (prefKey in settings) {
                let suggestedValue = settings[prefKey];

                const $checkBox = $content.querySelector<HTMLInputElement>(`#bx_suggest_${escapeCssSelector(prefKey)}`)!;
                if (!$checkBox.checked || $checkBox.disabled) {
                    continue;
                }

                const $control = settingsManager.getElement(prefKey);

                // Set value directly if the control element is not available
                if (!$control) {
                    setPref(prefKey, suggestedValue, 'direct');
                    continue;
                }

                // Transform value
                const { definition: settingDefinition } = getPrefInfo(prefKey);
                if (settingDefinition?.transformValue) {
                    suggestedValue = settingDefinition.transformValue.get.call(settingDefinition, suggestedValue);
                }

                if ('setValue' in $control) {
                    ($control as BxHtmlSettingElement).setValue(suggestedValue);
                } else {
                    ($control as HTMLInputElement).value = suggestedValue;
                }

                BxEvent.dispatch($control, 'input', {
                    manualTrigger: true,
                });
            }

            // Refresh suggested settings
            BxEvent.dispatch($select, 'input');
        };

        // Apply button
        const $btnApply = createButton({
            label: t('apply'),
            style: ButtonStyle.FULL_WIDTH | ButtonStyle.FOCUSABLE,
            onClick: onClickApply,
        });

        $content = CE('div', {
            class: 'bx-sub-content-box bx-suggest-box',
            _nearby: {
                orientation: 'vertical',
            }
        },
            BxSelectElement.create($select),
            $suggestedSettings,
            $btnApply,
        );

        $btnSuggest.insertAdjacentElement('afterend', $content);
    }

    // Sense servidor extern: no hi ha configuracions recomanades per dispositiu
    private static async getRecommendedSettings(this: SettingsDialog, androidInfo: BxFlags['DeviceInfo']['androidInfo']): Promise<string | null> {
        return null;
    }

    private static addDefaultSuggestedSetting(this: SettingsDialog, prefKey: AnyPref, value: any) {
        let key: keyof typeof this.suggestedSettings;
        for (key in this.suggestedSettings) {
            if (key !== 'default' && !(prefKey in this.suggestedSettings)) {
                this.suggestedSettings[key][prefKey] = value;
            }
        }
    }

    private static generateDefaultSuggestedSettings(this: SettingsDialog) {
        let key: keyof typeof this.suggestedSettings;
        for (key in this.suggestedSettings) {
            if (key === 'default') {
                continue;
            }

            let prefKey: AnyPref;
            for (prefKey in this.suggestedSettings[key]) {
                if (!(prefKey in this.suggestedSettings.default)) {
                    this.suggestedSettings.default[prefKey] = getPrefInfo(prefKey).definition.default;
                }
            }
        }
    }
}
