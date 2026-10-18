import { ButtonStyle, CE, createButton, createSettingRow, renderPresetsList } from "@/utils/html";
import type { SettingsDialog } from "../settings-dialog";
import { MkbMappingPresetsTable } from "@/utils/local-db/mkb-mapping-presets-table";
import { BxSelectElement } from "@/web-components/bx-select";
import { t } from "@/utils/translation";
import { getGlobalPref, getStreamPref, setStreamPref } from "@/utils/pref-utils";
import { GlobalPref, StreamPref } from "@/enums/pref-keys";
import { MkbMappingManagerDialog } from "../profile-manger/mkb-mapping-manager-dialog";
import { KeyboardShortcutsManagerDialog } from "../profile-manger/keyboard-shortcuts-manager-dialog";
import { KeyboardShortcutsTable } from "@/utils/local-db/keyboard-shortcuts-table";
import { BxIcon } from "@/utils/bx-icon";

export class MkbExtraSettings extends HTMLElement {
    private $mappingPresets!: BxSelectElement;
    private $shortcutsPresets!: BxSelectElement;

    private updateLayout!: typeof MkbExtraSettings['updateLayout'];
    private saveMkbSettings!: typeof MkbExtraSettings['saveMkbSettings'];
    private saveShortcutsSettings!: typeof MkbExtraSettings['saveShortcutsSettings'];

    static renderSettings(this: SettingsDialog): HTMLElement {
        const $container = document.createDocumentFragment() as unknown as MkbExtraSettings;

        $container.updateLayout = MkbExtraSettings.updateLayout.bind($container);
        $container.saveMkbSettings = MkbExtraSettings.saveMkbSettings.bind($container);
        $container.saveShortcutsSettings = MkbExtraSettings.saveShortcutsSettings.bind($container);

        const $mappingPresets = BxSelectElement.create(CE('select', {
            autocomplete: 'off',
            _on: {
                input: $container.saveMkbSettings,
            },
        }));

        const $shortcutsPresets = BxSelectElement.create(CE('select', {
            autocomplete: 'off',
            _on: {
                input: $container.saveShortcutsSettings,
            },
        }));

        $container.append(
            ...(getGlobalPref(GlobalPref.MKB_ENABLED) ? [
                createSettingRow(
                    t('virtual-controller'),
                    CE('div', {
                        class: 'bx-preset-row',
                        _nearby: {
                            orientation: 'horizontal',
                        },
                    },
                        $mappingPresets,
                        createButton({
                            title: t('manage'),
                            icon: BxIcon.MANAGE,
                            style: ButtonStyle.FOCUSABLE | ButtonStyle.PRIMARY | ButtonStyle.AUTO_HEIGHT,
                            onClick: () => MkbMappingManagerDialog.getInstance().show({
                                id: parseInt($container.$mappingPresets.value),
                            }),
                        }),
                    ),
                    {
                        multiLines: true,
                        onContextMenu: this.boundOnContextMenu,
                        pref: StreamPref.MKB_P1_MAPPING_PRESET_ID,
                    },
                ),

                createSettingRow(
                    t('virtual-controller-slot'),
                    this.settingsManager.getElement(StreamPref.MKB_P1_SLOT),
                    {
                        onContextMenu: this.boundOnContextMenu,
                        pref: StreamPref.MKB_P1_SLOT,
                    },
                ),
            ] : []),

            createSettingRow(
                t('in-game-keyboard-shortcuts'),
                CE('div', {
                    class: 'bx-preset-row',
                    _nearby: {
                        orientation: 'horizontal',
                    },
                },
                    $shortcutsPresets,
                    createButton({
                        title: t('manage'),
                        icon: BxIcon.MANAGE,
                        style: ButtonStyle.FOCUSABLE | ButtonStyle.PRIMARY | ButtonStyle.AUTO_HEIGHT,
                        onClick: () => KeyboardShortcutsManagerDialog.getInstance().show({
                            id: parseInt($container.$shortcutsPresets.value),
                        }),
                    }),
                ),
                {
                    multiLines: true,
                    onContextMenu: this.boundOnContextMenu,
                    pref: StreamPref.KEYBOARD_SHORTCUTS_IN_GAME_PRESET_ID,
                },
            ),
        );

        $container.$mappingPresets = $mappingPresets;
        $container.$shortcutsPresets = $shortcutsPresets;

        this.settingsManager.setElement(StreamPref.KEYBOARD_SHORTCUTS_IN_GAME_PRESET_ID, $shortcutsPresets);
        this.settingsManager.setElement(StreamPref.MKB_P1_MAPPING_PRESET_ID, $mappingPresets);

        $container.updateLayout();
        // Refresh layout when parent dialog is shown
        this.onMountedCallbacks.push(() => {
            $container.updateLayout();
        });

        return $container;
    }

    private static async updateLayout(this: MkbExtraSettings) {
        // Render shortcut presets
        const mappingPresets = await MkbMappingPresetsTable.getInstance().getPresets();
        renderPresetsList(this.$mappingPresets, mappingPresets, getStreamPref(StreamPref.MKB_P1_MAPPING_PRESET_ID));

        // Render shortcut presets
        const shortcutsPresets = await KeyboardShortcutsTable.getInstance().getPresets();
        renderPresetsList(this.$shortcutsPresets, shortcutsPresets, getStreamPref(StreamPref.KEYBOARD_SHORTCUTS_IN_GAME_PRESET_ID), { addOffValue: true });
    }

    private static async saveMkbSettings(this: MkbExtraSettings) {
        const presetId = parseInt(this.$mappingPresets.value);
        setStreamPref(StreamPref.MKB_P1_MAPPING_PRESET_ID, presetId, 'ui');
    }

    private static async saveShortcutsSettings(this: MkbExtraSettings) {
        const presetId = parseInt(this.$shortcutsPresets.value);
        setStreamPref(StreamPref.KEYBOARD_SHORTCUTS_IN_GAME_PRESET_ID, presetId, 'ui');
    }
}
