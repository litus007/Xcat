import type { MkbPresetData, MkbPresetRecord } from "@/types/presets";
import { BaseProfileManagerDialog } from "./base-profile-manager-dialog";
import { t } from "@/utils/translation";
import { MkbMappingPresetsTable } from "@/utils/local-db/mkb-mapping-presets-table";
import { GamepadKey, GamepadKeyName } from "@/enums/gamepad";
import { CE, createSettingRow } from "@/utils/html";
import { MouseMapTo } from "@/enums/mkb";
import { BxKeyBindingButton, BxKeyBindingButtonFlag } from "@/web-components/bx-key-binding-button";
import { StreamSettings } from "@/utils/stream-settings";
import { BxNumberStepper } from "@/web-components/bx-number-stepper";
import { deepClone } from "@/utils/global";
import { BxSelectElement } from "@/web-components/bx-select";

type MkbButtonDataset = {
    keySlot: number,
    buttonIndex: GamepadKey,
}

export class MkbMappingManagerDialog extends BaseProfileManagerDialog<MkbPresetRecord> {
    private static instance: MkbMappingManagerDialog;
    public static getInstance = () => MkbMappingManagerDialog.instance ?? (MkbMappingManagerDialog.instance = new MkbMappingManagerDialog(t('virtual-controller')));

    declare protected $content: HTMLElement;

    private readonly KEYS_PER_BUTTON = 2;
    private readonly BUTTONS_ORDER = [
        GamepadKey.HOME,
        GamepadKey.UP, GamepadKey.DOWN, GamepadKey.LEFT, GamepadKey.RIGHT,
        GamepadKey.A, GamepadKey.B, GamepadKey.X, GamepadKey.Y,
        GamepadKey.LB, GamepadKey.RB, GamepadKey.LT, GamepadKey.RT,
        GamepadKey.SELECT, GamepadKey.START,
        GamepadKey.L3, GamepadKey.LS_UP, GamepadKey.LS_DOWN, GamepadKey.LS_LEFT, GamepadKey.LS_RIGHT,
        GamepadKey.R3, GamepadKey.RS_UP, GamepadKey.RS_DOWN, GamepadKey.RS_LEFT, GamepadKey.RS_RIGHT,
    ];

    private readonly allKeyElements: BxKeyBindingButton[] = [];
    private $mouseMapTo!: BxSelectElement;
    private $mouseSensitivityX!: BxNumberStepper;
    private $mouseSensitivityY!: BxNumberStepper;
    private $mouseDeadzone!: BxNumberStepper;
    private $unbindNote!: HTMLElement;

    constructor(title: string) {
        super(title, MkbMappingPresetsTable.getInstance());
        this.render();
    }

    private onBindingKey = (e: MouseEvent) => {
        const $btn = e.target as HTMLButtonElement;
        if ($btn.disabled) {
            return;
        }

        if (e.button !== 0) {
            return;
        }
    };

    private parseDataset($btn: BxKeyBindingButton): MkbButtonDataset {
        const dataset = $btn.dataset;
        return {
            keySlot: parseInt(dataset.keySlot!),
            buttonIndex: parseInt(dataset.buttonIndex!),
        };
    }

    private onKeyChanged = (e: Event) => {
        const $current = e.target as BxKeyBindingButton;
        const keyInfo = $current.keyInfo;

        // Unbind duplicated keys
        if (keyInfo) {
            for (const $elm of this.allKeyElements) {
                if ($elm !== $current && $elm.keyInfo?.code === keyInfo.code) {
                    // Unbind manually
                    $elm.unbindKey(true);
                }
            }
        }

        // Save preset
        this.savePreset();
    }

    private render() {
        const $rows = CE('div', false,
            this.$unbindNote = CE('i', { class: 'bx-mkb-note' }, t('right-click-to-unbind')),
        );

        for (const buttonIndex of this.BUTTONS_ORDER) {
            const [buttonName, buttonPrompt] = GamepadKeyName[buttonIndex];

            let $elm;
            const $fragment = document.createDocumentFragment();
            for (let i = 0; i < this.KEYS_PER_BUTTON; i++) {
                $elm = BxKeyBindingButton.create({
                    title: buttonPrompt,
                    isPrompt: true,
                    allowedFlags: [BxKeyBindingButtonFlag.KEYBOARD_PRESS, BxKeyBindingButtonFlag.MOUSE_CLICK, BxKeyBindingButtonFlag.MOUSE_WHEEL],
                    onChanged: this.onKeyChanged,
                });

                $elm.dataset.buttonIndex = buttonIndex.toString();
                $elm.dataset.keySlot = i.toString();

                $elm.addEventListener('mouseup', this.onBindingKey);

                $fragment.appendChild($elm);
                this.allKeyElements.push($elm);
            }

            const $keyRow = CE('div', {
                class: 'bx-mkb-key-row',
                _nearby: { orientation: 'horizontal' },
            },
                CE('label', { title: buttonName }, buttonPrompt),
                $fragment,
            );

            $rows.appendChild($keyRow);
        }

        const savePreset = () => this.savePreset();
        const $extraSettings = CE('div', false,
            createSettingRow(
                t('map-mouse-to'),
                this.$mouseMapTo = BxSelectElement.create(CE('select', { _on: { input: savePreset } },
                    CE('option', { value: MouseMapTo.RS }, t('right-stick')),
                    CE('option', { value: MouseMapTo.LS }, t('left-stick')),
                    CE('option', { value: MouseMapTo.OFF }, t('off')),
                )),
            ),

            createSettingRow(
                t('horizontal-sensitivity'),
                this.$mouseSensitivityX = BxNumberStepper.create('hor_sensitivity', 0, 1, 300, {
                    suffix: '%',
                    exactTicks: 50,
                }, savePreset),
            ),

            createSettingRow(
                t('vertical-sensitivity'),
                this.$mouseSensitivityY = BxNumberStepper.create('ver_sensitivity', 0, 1, 300, {
                    suffix: '%',
                    exactTicks: 50,
                }, savePreset),
            ),

            createSettingRow(
                t('deadzone-counterweight'),
                this.$mouseDeadzone = BxNumberStepper.create('deadzone_counterweight', 0, 1, 50, {
                    suffix: '%',
                    exactTicks: 10,
                }, savePreset),
            ),
        );

        this.$content = CE('div', false,
            $rows,
            $extraSettings,
        );
    }

    protected switchPreset(id: number): void {
        const preset = this.allPresets.data[id];
        if (!preset) {
            this.currentPresetId = 0;
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
            const { buttonIndex, keySlot } = this.parseDataset($elm);

            const buttonKeys =  presetData.mapping[buttonIndex];
            if (buttonKeys && buttonKeys[keySlot]) {
                $elm.bindKey({
                    code: buttonKeys[keySlot],
                }, true)
            } else {
                $elm.unbindKey(true);
            }

            $elm.disabled = isDefaultPreset;
        }

        // Update mouse settings
        const mouse = presetData.mouse;
        this.$mouseMapTo.value = mouse.mapTo.toString();
        this.$mouseSensitivityX.value = mouse.sensitivityX.toString();
        this.$mouseSensitivityY.value = mouse.sensitivityY.toString();
        this.$mouseDeadzone.value = mouse.deadzoneCounterweight.toString();

        this.$mouseMapTo.disabled = isDefaultPreset;
        this.$mouseSensitivityX.dataset.disabled = isDefaultPreset.toString();
        this.$mouseSensitivityY.dataset.disabled = isDefaultPreset.toString();
        this.$mouseDeadzone.dataset.disabled = isDefaultPreset.toString();
    }

    private savePreset() {
        const presetData = deepClone(this.presetsDb.BLANK_PRESET_DATA) as MkbPresetData;

        // Get mapping
        for (const $elm of this.allKeyElements) {
            const { buttonIndex, keySlot } = this.parseDataset($elm);
            const mapping = presetData.mapping;
            if (!mapping[buttonIndex]) {
                mapping[buttonIndex] = [];
            }

            if (!$elm.keyInfo) {
                // Remove empty key from mapping
                delete mapping[buttonIndex][keySlot];
            } else {
                mapping[buttonIndex][keySlot] = $elm.keyInfo.code as KeyCode;
            }
        }

        // Get mouse settings
        const mouse = presetData.mouse;
        mouse.mapTo = parseInt(this.$mouseMapTo.value) as MouseMapTo;
        mouse.sensitivityX = parseInt(this.$mouseSensitivityX.value);
        mouse.sensitivityY = parseInt(this.$mouseSensitivityY.value);
        mouse.deadzoneCounterweight = parseInt(this.$mouseDeadzone.value);

        const oldPreset = this.allPresets.data[this.currentPresetId!];
        const newPreset = {
            id: this.currentPresetId!,
            name: oldPreset.name,
            data: presetData,
        };
        this.presetsDb.updatePreset(newPreset);

        this.allPresets.data[this.currentPresetId!] = newPreset;
    }

    onBeforeUnmount() {
        StreamSettings.refreshMkbSettings();
        super.onBeforeUnmount();
    }
}
