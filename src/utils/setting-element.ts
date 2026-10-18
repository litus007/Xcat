import { CE, escapeCssSelector } from "@utils/html";
import type { AnyPref } from "@/enums/pref-keys";
import { type BaseSettingDefinition, type MultipleOptionsParams, type NumberStepperParams } from "@/types/setting-definition";
import { BxEvent } from "./bx-event";
import { BxNumberStepper } from "@/web-components/bx-number-stepper";
import { getPrefInfo, isGlobalPref, setGlobalPref, setGamePref } from "./pref-utils";
import { SettingsManager } from "@/modules/settings-manager";

export enum SettingElementType {
    OPTIONS = 'options',
    MULTIPLE_OPTIONS = 'multiple-options',
    NUMBER_STEPPER = 'number-stepper',
    CHECKBOX = 'checkbox',
}

interface BxBaseSettingElement {
    setValue: (value: any) => void,
}

export interface BxHtmlSettingElement extends HTMLElement, BxBaseSettingElement {};

export interface BxSelectSettingElement extends HTMLSelectElement, BxBaseSettingElement {}

export class SettingElement {
    private static renderOptions(key: string, setting: PreferenceSetting, currentValue: any, onChange: any): BxSelectSettingElement {
        const $control = CE('select', {
            // title: setting.label,
            tabindex: 0,
        }) as BxSelectSettingElement;

        let $parent: HTMLElement;
        if (setting.optionsGroup) {
            $parent = CE('optgroup', {
                label: setting.optionsGroup,
            });
            $control.appendChild($parent);
        } else {
            $parent = $control;
        }

        for (let value in setting.options) {
            const label = setting.options[value];

            const $option = CE('option', { value }, label);
            $parent.appendChild($option);
        }

        $control.value = currentValue;
        onChange && $control.addEventListener('input', e => {
            const target = e.target as HTMLSelectElement;
            const value = (setting.type && setting.type === 'number') ? parseInt(target.value) : target.value;

            !(e as any).ignoreOnChange && onChange(e, value);
        });

        // Custom method
        $control.setValue = (value: any) => {
            $control.value = value;
        };

        return $control;
    }

    private static renderMultipleOptions(key: string, setting: PreferenceSetting, currentValue: any, onChange: any, params: MultipleOptionsParams={}): BxSelectSettingElement {
        const $control = CE('select', {
            // title: setting.label,
            multiple: true,
            tabindex: 0,
        }) as BxSelectSettingElement;

        const totalOptions = Object.keys(setting.multipleOptions!).length;
        const size = params.size ? Math.min(params.size, totalOptions) : totalOptions;
        $control.setAttribute('size', size.toString());

        for (const value in setting.multipleOptions) {
            const label = setting.multipleOptions[value];

            const $option = CE('option', { value }, label) as HTMLOptionElement;
            $option.selected = currentValue.indexOf(value) > -1;

            $option.addEventListener('mousedown', function(e) {
                e.preventDefault();

                const target = e.target as HTMLOptionElement;
                target.selected = !target.selected;

                const $parent = target.parentElement!;
                $parent.focus();
                BxEvent.dispatch($parent, 'input');
            });

            $control.appendChild($option);
        }

        $control.addEventListener('mousedown', function(e) {
            const self = this;
            const orgScrollTop = self.scrollTop;
            window.setTimeout(() => (self.scrollTop = orgScrollTop), 0);
        });

        $control.addEventListener('mousemove', e => e.preventDefault());

        onChange && $control.addEventListener('input', (e: Event) => {
            const target = e.target as HTMLSelectElement
            const values = Array.from(target.selectedOptions).map(i => i.value);

            !(e as any).ignoreOnChange && onChange(e, values);
        });

        Object.defineProperty($control, 'value', {
            get() {
                return Array.from($control.options)
                    .filter(option => option.selected)
                    .map(option => option.value);
            },
            set(value) {
                const values = value.split(',');
                Array.from($control.options).forEach(option => {
                    option.selected = values.includes(option.value);
                });
            },
        });

        return $control;
    }

    private static renderCheckbox(key: string, setting: PreferenceSetting, currentValue: any, onChange: any) {
        const $control = CE('input', { type: 'checkbox', tabindex: 0 }) as HTMLInputElement;
        $control.checked = currentValue;

        onChange && $control.addEventListener('input', e => {
            !(e as any).ignoreOnChange && onChange(e, (e.target as HTMLInputElement).checked);
        });

        ($control as any).setValue = (value: boolean) => {
            $control.checked = !!value;
        };

        return $control;
    }

    private static renderNumberStepper(key: string, setting: PreferenceSetting, value: any, onChange: any, options: NumberStepperParams={}) {
        const $control = BxNumberStepper.create(key, value, setting.min!, setting.max!, options, onChange);
        return $control;
    }

    private static readonly METHOD_MAP = {
        [SettingElementType.OPTIONS]: SettingElement.renderOptions,
        [SettingElementType.MULTIPLE_OPTIONS]: SettingElement.renderMultipleOptions,
        [SettingElementType.NUMBER_STEPPER]: SettingElement.renderNumberStepper,
        [SettingElementType.CHECKBOX]: SettingElement.renderCheckbox,
    };

    static render(type: SettingElementType, key: string, setting: BaseSettingDefinition, currentValue: any, onChange: any, options: any) {
        const method = SettingElement.METHOD_MAP[type];
        // @ts-ignore
        const $control = method(...Array.from(arguments).slice(1)) as HTMLElement;

        if (type !== SettingElementType.NUMBER_STEPPER) {
            $control.id = `bx_setting_${escapeCssSelector(key)}`;
        }

        // Add "name" property to "select" elements
        if (type === SettingElementType.OPTIONS || type === SettingElementType.MULTIPLE_OPTIONS) {
            ($control as HTMLSelectElement).name = $control.id;
        }

        return $control;
    }

    static fromPref(key: AnyPref, onChange?: ((e: Event, value: any) => void) | null | undefined, overrideParams={}) {
        const { definition, storage } = getPrefInfo(key);
        if (!definition) {
            return null;
        }

        // @ts-ignore
        let currentValue = storage.getSetting(key) as any;

        let type;
        if ('options' in definition) {
            type = SettingElementType.OPTIONS;
        } else if ('multipleOptions' in definition) {
            type = SettingElementType.MULTIPLE_OPTIONS;
        } else if (typeof definition.default === 'number') {
            type = SettingElementType.NUMBER_STEPPER;
        } else {
            type = SettingElementType.CHECKBOX;
        }

        let params: any = {};
        if ('params' in definition) {
            params = Object.assign(overrideParams, definition.params || {});
        }

        if (params.disabled) {
            currentValue = definition.default;
        }

        const $control = SettingElement.render(type!, key as string, definition, currentValue, (e: Event, value: any) => {
            if (isGlobalPref(key)) {
                setGlobalPref(key, value, 'ui');
            } else {
                const id = SettingsManager.getInstance().getTargetGameId();
                setGamePref(id, key, value, 'ui');
            }

            onChange && onChange(e, value);
        }, params);

        return $control;
    }
}
