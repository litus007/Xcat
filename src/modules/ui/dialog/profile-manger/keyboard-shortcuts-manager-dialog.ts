import { t } from "@/utils/translation";
import { BaseProfileManagerDialog } from "./base-profile-manager-dialog";
import type { KeyboardShortcutPresetData, KeyboardShortcutPresetRecord } from "@/types/presets";
import { CE, createSettingRow } from "@/utils/html";
import { KeyboardShortcutDefaultId, KeyboardShortcutsTable } from "@/utils/local-db/keyboard-shortcuts-table";
import { SHORTCUT_ACTIONS } from "@/modules/shortcuts/shortcut-actions";
import { BxKeyBindingButton, BxKeyBindingButtonFlag } from "@/web-components/bx-key-binding-button";
import type { ShortcutAction } from "@/enums/shortcut-actions";
import { deepClone } from "@/utils/global";
import { StreamSettings } from "@/utils/stream-settings";

type KeyboardShortcutButtonDataset = {
    action: ShortcutAction,
}

export class KeyboardShortcutsManagerDialog extends BaseProfileManagerDialog<KeyboardShortcutPresetRecord> {
    private static instance: KeyboardShortcutsManagerDialog;
    public static getInstance = () => KeyboardShortcutsManagerDialog.instance ?? (KeyboardShortcutsManagerDialog.instance = new KeyboardShortcutsManagerDialog(t('keyboard-shortcuts')));
    // private readonly LOG_TAG = 'KeyboardShortcutsManagerDialog';

    protected $content: HTMLElement;
    private $unbindNote: HTMLElement;
    private readonly allKeyElements: BxKeyBindingButton[] = [];

    constructor(title: string) {
        super(title, KeyboardShortcutsTable.getInstance());

        const $rows = CE('div', { class: 'bx-keyboard-shortcuts-manager-container' });

        for (const groupLabel in SHORTCUT_ACTIONS) {
            const items = SHORTCUT_ACTIONS[groupLabel];
            if (!items) {
                continue;
            }

            const $fieldSet = CE('fieldset', false, CE('legend', false, groupLabel));
            for (const action in items) {
                const crumbs = items[action as keyof typeof items];
                if (!crumbs) {
                    continue;
                }

                const label = crumbs.join(' ❯ ');
                const $btn = BxKeyBindingButton.create({
                    title: label,
                    isPrompt: false,
                    onChanged: this.onKeyChanged,

                    allowedFlags: [BxKeyBindingButtonFlag.KEYBOARD_PRESS, BxKeyBindingButtonFlag.KEYBOARD_MODIFIER],
                });
                $btn.classList.add('bx-full-width');
                $btn.dataset.action = action;
                this.allKeyElements.push($btn);

                const $row = createSettingRow(label, CE('div', { class: 'bx-binding-button-wrapper' }, $btn));
                $fieldSet.appendChild($row);
            }

            // Don't append empty <fieldset>
            if ($fieldSet.childElementCount > 1) {
                $rows.appendChild($fieldSet);
            }
        }

        this.$content = CE('div', false,
            this.$unbindNote = CE('i', { class: 'bx-mkb-note' }, t('right-click-to-unbind')),
            $rows,
        );
    }

    private onKeyChanged = (e: Event) => {
        const $current = e.target as BxKeyBindingButton;
        const keyInfo = $current.keyInfo;

        // Unbind duplicated keys
        if (keyInfo) {
            for (const $elm of this.allKeyElements) {
                if ($elm === $current) {
                    continue;
                }

                if ($elm.keyInfo?.code === keyInfo.code && $elm.keyInfo?.modifiers === keyInfo.modifiers) {
                    // Unbind manually
                    $elm.unbindKey(true);
                }
            }
        }

        // Save preset
        this.savePreset();
    }

    private parseDataset($btn: BxKeyBindingButton): KeyboardShortcutButtonDataset {
        const dataset = $btn.dataset;
        return {
            action: dataset.action as ShortcutAction,
        };
    }

    protected switchPreset(id: number): void {
        const preset = this.allPresets.data[id];
        if (!preset) {
            this.currentPresetId = KeyboardShortcutDefaultId.OFF;
            return;
        }

        const presetData = preset.data;
        this.currentPresetId = id;
        const isDefaultPreset = id <= 0;
        this.updateButtonStates();

        // Toggle unbind note
        this.$unbindNote.classList.toggle('bx-gone', isDefaultPreset);

        // Update buttons
        for (const $elm of this.allKeyElements) {
            const { action } = this.parseDataset($elm);

            const keyInfo = presetData.mapping[action];
            if (keyInfo) {
                $elm.bindKey(keyInfo, true)
            } else {
                $elm.unbindKey(true);
            }

            $elm.disabled = isDefaultPreset;
        }
    }

    private savePreset() {
        const presetData = deepClone(this.presetsDb.BLANK_PRESET_DATA) as KeyboardShortcutPresetData;

        // Get mapping
        for (const $elm of this.allKeyElements) {
            const { action } = this.parseDataset($elm);

            const mapping = presetData.mapping;
            if ($elm.keyInfo) {
                mapping[action] = $elm.keyInfo;
            }
        }

        const oldPreset = this.allPresets.data[this.currentPresetId!];
        const newPreset = {
            id: this.currentPresetId!,
            name: oldPreset.name,
            data: presetData,
        };
        this.presetsDb.updatePreset(newPreset);

        this.allPresets.data[this.currentPresetId!] = newPreset;
    }

    onBeforeUnmount(): void {
        StreamSettings.refreshKeyboardShortcuts();
        super.onBeforeUnmount();
    }
}
