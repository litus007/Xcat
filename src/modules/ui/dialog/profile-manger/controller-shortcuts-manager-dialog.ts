import { t } from "@/utils/translation";
import { BaseProfileManagerDialog } from "./base-profile-manager-dialog";
import { CE } from "@/utils/html";
import { GamepadKey, GamepadKeyName } from "@/enums/gamepad";
import { PrompFont } from "@/enums/prompt-font";
import { ShortcutAction } from "@/enums/shortcut-actions";
import { deepClone } from "@/utils/global";
import { setNearby } from "@/utils/navigation-utils";
import { BxSelectElement } from "@/web-components/bx-select";
import type { ControllerShortcutPresetData, ControllerShortcutPresetRecord } from "@/types/presets";
import { ControllerShortcutsTable } from "@/utils/local-db/controller-shortcuts-table";
import { BxEvent } from "@/utils/bx-event";
import { StreamSettings } from "@/utils/stream-settings";
import { SHORTCUT_ACTIONS } from "@/modules/shortcuts/shortcut-actions";

export class ControllerShortcutsManagerDialog extends BaseProfileManagerDialog<ControllerShortcutPresetRecord> {
    private static instance: ControllerShortcutsManagerDialog;
    public static getInstance = () => ControllerShortcutsManagerDialog.instance ?? (ControllerShortcutsManagerDialog.instance = new ControllerShortcutsManagerDialog(t('controller-shortcuts')));
    // private readonly LOG_TAG = 'ControllerShortcutsManagerDialog';

    protected $content: HTMLElement;
    private selectActions: PartialRecord<GamepadKey, HTMLSelectElement> = {};

    private readonly BUTTONS_ORDER = [
        GamepadKey.Y, GamepadKey.A, GamepadKey.X, GamepadKey.B,
        GamepadKey.UP, GamepadKey.DOWN, GamepadKey.LEFT, GamepadKey.RIGHT,
        GamepadKey.SELECT, GamepadKey.START,
        GamepadKey.LB, GamepadKey.RB,
        GamepadKey.LT, GamepadKey.RT,
        GamepadKey.L3, GamepadKey.R3,
    ];

    constructor(title: string) {
        super(title, ControllerShortcutsTable.getInstance());

        const $baseSelect = CE('select', {
            class: 'bx-full-width',
            autocomplete: 'off',
        }, CE('option', { value: '' }, '---'));

        for (const groupLabel in SHORTCUT_ACTIONS) {
            const items = SHORTCUT_ACTIONS[groupLabel];
            if (!items) {
                continue;
            }

            const $optGroup = CE('optgroup', { label: groupLabel });
            for (const action in items) {
                const crumbs = items[action as keyof typeof items];
                if (!crumbs) {
                    continue;
                }

                const label = crumbs.join(' ❯ ');
                const $option = CE('option', { value: action }, label);
                $optGroup.appendChild($option);
            }

            $baseSelect.appendChild($optGroup);
        }

        const $content = CE('div', {
            class: 'bx-controller-shortcuts-manager-container',
        });

        const onActionChanged = (e: Event) => {
            // Update preset
            if (!(e as any).ignoreOnChange) {
                this.updatePreset();
            }
        };

        const fragment = document.createDocumentFragment();
        fragment.appendChild(CE('p', { class: 'bx-shortcut-note' },
            CE('span', { class: 'bx-prompt' }, PrompFont.HOME),
            ': ' + t('controller-shortcuts-xbox-note'),
        ));

        for (const button of this.BUTTONS_ORDER) {
            const prompt = GamepadKeyName[button][1];

            const $row = CE('div', {
                class: 'bx-shortcut-row',
                _nearby: {
                    orientation: 'horizontal',
                },
            });
            const $label = CE('label', { class: 'bx-prompt' }, `${PrompFont.HOME}${prompt}`);

            const $select = BxSelectElement.create($baseSelect.cloneNode(true) as HTMLSelectElement);
            $select.dataset.button = button.toString();
            $select.addEventListener('input', onActionChanged);

            this.selectActions[button] = $select;

            setNearby($row, {
                focus: $select,
            });

            $row.append($label, $select);
            fragment.appendChild($row);
        }

        $content.appendChild(fragment);

        this.$content = $content;
    }

    protected switchPreset(id: number): void {
        const preset = this.allPresets.data[id];
        if (!preset) {
            this.currentPresetId = 0;
            return;
        }

        this.currentPresetId = id;
        const isDefaultPreset = id <= 0;
        const actions = preset.data;

        // Reset selects' values
        let button: unknown;
        for (button in this.selectActions) {
            const $select = this.selectActions[button as GamepadKey]!;
            $select.value = actions.mapping[button as GamepadKey] || '';
            $select.disabled = isDefaultPreset;

            BxEvent.dispatch($select, 'input', {
                ignoreOnChange: true,
                manualTrigger: true,
            });
        }

        super.updateButtonStates();
    }

    private updatePreset() {
        const newData: ControllerShortcutPresetData = deepClone(this.presetsDb.BLANK_PRESET_DATA);

        let button: unknown;
        for (button in this.selectActions) {
            const $select = this.selectActions[button as GamepadKey]!;
            const action = $select.value;
            if (!action) {
                continue;
            }

            newData.mapping[button as GamepadKey] = action as ShortcutAction;
        }

        const preset = this.allPresets.data[this.currentPresetId!];
        preset.data = newData;
        this.presetsDb.updatePreset(preset);
    }

    onBeforeUnmount() {
        StreamSettings.refreshControllerSettings();
        super.onBeforeUnmount();
    }
}
