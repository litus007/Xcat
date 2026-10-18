import type { DualNumberStepperParams } from "@/types/setting-definition";
import { CE, escapeCssSelector } from "@/utils/html";
import { setNearby } from "@/utils/navigation-utils";
import type { BxHtmlSettingElement } from "@/utils/setting-element";
import { t } from "@/utils/translation";


export class BxDualNumberStepper extends HTMLInputElement implements BxHtmlSettingElement  {
    private controlValues!: [number, number];
    private controlMin!: number;
    private controlMinDiff!: number;
    private controlMax!: number;

    private steps!: number;
    private options!: DualNumberStepperParams;
    private onChange: any;

    private $text!: HTMLSpanElement;
    private $rangeFrom!: HTMLInputElement;
    private $rangeTo!: HTMLInputElement;
    private $activeRange!: HTMLInputElement;

    onRangeInput!: typeof BxDualNumberStepper['onRangeInput'];

    setValue!: typeof BxDualNumberStepper['setValues'];
    getValue!: typeof BxDualNumberStepper['getValues'];
    normalizeValue!: typeof BxDualNumberStepper['normalizeValues'];

    static create(key: string, values: [number, number], options: DualNumberStepperParams, onChange?: any) {
        options.suffix = options.suffix || '';
        options.disabled = !!options.disabled;

        let $text: HTMLSpanElement;
        let $rangeFrom: HTMLInputElement;
        let $rangeTo: HTMLInputElement;

        const $wrapper = CE('div', {
            class: 'bx-dual-number-stepper',
            id: `bx_setting_${escapeCssSelector(key)}`,
        },
            $text = CE('span') as HTMLSpanElement,
        ) as BxDualNumberStepper;

        const self = $wrapper;
        self.$text = $text;
        self.onChange = onChange;

        self.onRangeInput = BxDualNumberStepper.onRangeInput.bind(self);

        self.controlMin = options.min;
        self.controlMax = options.max;
        self.controlMinDiff = options.minDiff;

        self.options = options;
        self.steps = Math.max(options.steps || 1, 1);

        if (options.disabled) {
            (self as any).disabled = true;
            return self;
        }

        $rangeFrom = CE('input', {
            // id: `bx_inp_setting_${key}`,
            type: 'range',
            min: self.controlMin,
            max: self.controlMax,
            step: self.steps,
            tabindex: 0,
        });
        $rangeTo = $rangeFrom.cloneNode() as HTMLInputElement;

        self.$rangeFrom = $rangeFrom;
        self.$rangeTo = $rangeTo;
        self.$activeRange = $rangeFrom;
        self.getValue = BxDualNumberStepper.getValues.bind(self);
        self.setValue = BxDualNumberStepper.setValues.bind(self);

        $rangeFrom.addEventListener('input', self.onRangeInput);
        $rangeTo.addEventListener('input', self.onRangeInput);

        self.addEventListener('input', self.onRangeInput);
        self.append(CE('div', false, $rangeFrom, $rangeTo));

        // Set values
        BxDualNumberStepper.setValues.call(self, values);

        self.addEventListener('contextmenu', BxDualNumberStepper.onContextMenu);
        setNearby(self, {
            focus: $rangeFrom,
            orientation: 'vertical',
        });

        Object.defineProperty(self, 'value', {
            get() { return self.controlValues; },
            set(value) {
                let from: number | undefined;
                let to: number | undefined;
                if (typeof value === 'string') {
                    const tmp = value.split(',');
                    from = parseInt(tmp[0]);
                    to = parseInt(tmp[1]);
                } else if (Array.isArray(value)) {
                    [from, to] = value;
                }

                if (typeof from !== 'undefined' && typeof to !== 'undefined') {
                    BxDualNumberStepper.setValues.call(self, [from, to]);
                }
            },
        });

        return self;
    }

    private static setValues(this: BxDualNumberStepper, values: [number, number] | undefined | null) {
        let from: number;
        let to: number;

        if (values) {
            [from, to] = BxDualNumberStepper.normalizeValues.call(this, values);
        } else {
            from = this.controlMin;
            to = this.controlMax;
            values = [from, to];
        }

        this.controlValues = [from, to];
        this.$text.textContent = BxDualNumberStepper.updateTextValue.call(this);

        this.$rangeFrom.value = from.toString();
        this.$rangeTo.value = to.toString();

        const ratio = 100 / (this.controlMax - this.controlMin);
        this.style.setProperty('--from', (ratio * (from - this.controlMin)) + '%');
        this.style.setProperty('--to', (ratio * (to - this.controlMin)) + '%');
    }

    private static getValues(this: BxDualNumberStepper) {
        return this.controlValues || [this.controlMin, this.controlMax];
    }

    private static normalizeValues(this: BxDualNumberStepper, values: [number, number]): [number, number] {
        let [from, to] = values;

        if (this.$activeRange === this.$rangeFrom) {
            to = Math.min(this.controlMax, to);
            from = Math.min(from, to);
            from = Math.min(to - this.controlMinDiff, from);
        } else {
            from = Math.max(this.controlMin, from);
            to = Math.max(from, to);
            to = Math.max(this.controlMinDiff + from, to);
        }

        to = Math.min(this.controlMax, to);
        from = Math.min(from, to);

        return [from, to];
    }

    private static onRangeInput(this: BxDualNumberStepper, e: Event) {
        this.$activeRange = e.target as HTMLInputElement;
        const values = BxDualNumberStepper.normalizeValues.call(this, [parseInt(this.$rangeFrom.value), parseInt(this.$rangeTo.value)]);
        BxDualNumberStepper.setValues.call(this, values);

        if (!(e as any).ignoreOnChange && this.onChange) {
            this.onChange(e, values);
        }
    }

    private static onContextMenu(e: Event) {
        e.preventDefault();
    }

    private static updateTextValue(this: BxDualNumberStepper): string | null {
        const values = this.controlValues;

        let textContent = null;
        if (this.options.customTextValue) {
            textContent = this.options.customTextValue(values, this.controlMin, this.controlMax);
        }

        if (textContent === null) {
            const [from, to] = values;
            if (from === this.controlMin && to === this.controlMax) {
                textContent = t('default');
            } else {
                const pad = to.toString().length;
                textContent = `${from.toString().padStart(pad)} - ${to.toString().padEnd(pad)}${this.options.suffix}`;
            }
        }

        return textContent;
    }
}
