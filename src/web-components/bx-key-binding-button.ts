import type { PrompFont } from "@/enums/prompt-font";
import { KeyHelper, type KeyEventInfo } from "@/modules/mkb/key-helper";
import { BxEvent } from "@/utils/bx-event";
import { CE } from "@/utils/html";
import { t } from "@/utils/translation";

export const enum BxKeyBindingButtonFlag {
    KEYBOARD_PRESS = 1,
    KEYBOARD_MODIFIER = 2,
    MOUSE_CLICK = 4,
    MOUSE_WHEEL = 8,
}

export type BxKeyBindingButtonOptions = {
    title: string | PrompFont;
    isPrompt: boolean;
    onChanged: (e: Event) => void;

    allowedFlags: BxKeyBindingButtonFlag[];
};

type KeyBindingDialogOptions = {
    $elm: BxKeyBindingButton;
};


export class BxKeyBindingButton extends HTMLButtonElement {
    title!: string;
    isPrompt = false;
    allowedFlags!: BxKeyBindingButtonFlag[];
    keyInfo: KeyEventInfo | null = null;

    // Fake methods
    bindKey!: typeof BxKeyBindingButton['bindKey'];
    unbindKey!: typeof BxKeyBindingButton['unbindKey'];

    static create(options: BxKeyBindingButtonOptions) {
        const $btn = CE('button', {
            class: 'bx-binding-button bx-focusable',
            type: 'button',
        }) as BxKeyBindingButton;

        $btn.title = options.title;
        $btn.isPrompt = !!options.isPrompt;
        $btn.allowedFlags = options.allowedFlags;

        $btn.bindKey = BxKeyBindingButton.bindKey.bind($btn);
        $btn.unbindKey = BxKeyBindingButton.unbindKey.bind($btn);

        $btn.addEventListener('click', BxKeyBindingButton.onClick.bind($btn))
        $btn.addEventListener('contextmenu', BxKeyBindingButton.onContextMenu);
        $btn.addEventListener('change', options.onChanged);

        return $btn;
    }

    private static onClick(this: BxKeyBindingButton, e: Event) {
        KeyBindingDialog.getInstance().show({
            $elm: this,
        });
    }

    private static onContextMenu = (e: Event) => {
        e.preventDefault();

        const $btn = e.target as BxKeyBindingButton;
        if (!$btn.disabled) {
            $btn.unbindKey.apply($btn);
        }
    }

    private static bindKey(this: BxKeyBindingButton, key: KeyEventInfo | null, force=false) {
        if (!key) {
            return;
        }

        if (force || this.keyInfo === null || key.code !== this.keyInfo?.code || key.modifiers !== this.keyInfo?.modifiers) {
            this.textContent = KeyHelper.codeToKeyName(key);
            this.keyInfo = key;

            if (!force) {
                BxEvent.dispatch(this, 'change');
            }
        }
    }

    private static unbindKey(this: BxKeyBindingButton, force=false) {
        this.textContent = '';
        this.keyInfo = null;

        !force && BxEvent.dispatch(this, 'change');
    }

    private constructor() {
        super();
    }
}


class KeyBindingDialog {
    private static instance: KeyBindingDialog;
    public static getInstance = () => KeyBindingDialog.instance ?? (KeyBindingDialog.instance = new KeyBindingDialog());

    $dialog: HTMLElement;
    $wait!: HTMLElement;
    $title: HTMLElement;
    $inputList: HTMLElement;
    $overlay: HTMLElement;

    $currentElm!: BxKeyBindingButton;
    countdownIntervalId!: number | null;

    constructor() {
        // Create dialog overlay
        this.$overlay = CE('div', { class: 'bx-key-binding-dialog-overlay bx-gone' });

        // Disable right click
        this.$overlay.addEventListener('contextmenu', e => e.preventDefault());
        document.documentElement.appendChild(this.$overlay);

        this.$dialog = CE('div', { class: `bx-key-binding-dialog bx-gone` },
            this.$title = CE('h2', {}),
            CE('div', { class: 'bx-key-binding-dialog-content' },
                CE('div', false,
                    this.$wait = CE('p', { class: 'bx-blink-me' }),
                    this.$inputList = CE('ul', false,
                        CE('li', { _dataset: { flag: BxKeyBindingButtonFlag.KEYBOARD_PRESS } }, t('keyboard-key')),
                        CE('li', { _dataset: { flag: BxKeyBindingButtonFlag.KEYBOARD_MODIFIER } }, t('modifiers-note')),
                        CE('li', { _dataset: { flag: BxKeyBindingButtonFlag.MOUSE_CLICK } }, t('mouse-click')),
                        CE('li', { _dataset: { flag: BxKeyBindingButtonFlag.MOUSE_WHEEL } }, t('mouse-wheel')),
                    ),
                    CE('i', false, t('press-esc-to-cancel')),
                ),
            ),
        );

        // Disable right click
        this.$dialog.addEventListener('contextmenu', e => e.preventDefault());

        document.documentElement.appendChild(this.$dialog);
    }

    show(options: KeyBindingDialogOptions) {
        this.$currentElm = options.$elm;
        this.addEventListeners();

        const allowedFlags = this.$currentElm.allowedFlags;
        this.$inputList.dataset.flags = '[' + allowedFlags.join('][') + ']';

        // Clear focus
        document.activeElement && (document.activeElement as HTMLElement).blur();

        this.$title.textContent = this.$currentElm.title;
        this.$title.classList.toggle('bx-prompt', this.$currentElm.isPrompt);

        this.$dialog.classList.remove('bx-gone');
        this.$overlay.classList.remove('bx-gone');

        // Start counting down
        this.startCountdown();
    }

    private startCountdown() {
        this.stopCountdown();

        let count = 9;
        this.$wait.textContent = `[${count}] ${t('waiting-for-input')}`;

        this.countdownIntervalId = window.setInterval(() => {
            count -= 1;
            if (count === 0) {
                this.stopCountdown();
                this.hide();
                return;
            }

            this.$wait.textContent = `[${count}] ${t('waiting-for-input')}`;
        }, 1000);
    }

    private stopCountdown() {
        this.countdownIntervalId && clearInterval(this.countdownIntervalId);
        this.countdownIntervalId = null;
    }

    private hide = () => {
        this.clearEventListeners();

        this.$dialog.classList.add('bx-gone');
        this.$overlay.classList.add('bx-gone');
    }

    private addEventListeners() {
        const allowedFlags = this.$currentElm.allowedFlags;

        if (allowedFlags.includes(BxKeyBindingButtonFlag.KEYBOARD_PRESS)) {
            window.addEventListener('keyup', this);
        }

        if (allowedFlags.includes(BxKeyBindingButtonFlag.MOUSE_CLICK)) {
            window.addEventListener('mousedown', this);
        }

        if (allowedFlags.includes(BxKeyBindingButtonFlag.MOUSE_WHEEL)) {
            window.addEventListener('wheel', this);
        }
    }

    private clearEventListeners() {
        window.removeEventListener('keyup', this);
        window.removeEventListener('mousedown', this);
        window.removeEventListener('wheel', this);
    }

    handleEvent(e: Event) {
        const allowedFlags = this.$currentElm.allowedFlags;
        let handled = false;
        let valid = false;

        switch (e.type) {
            case 'wheel':
                handled = true;

                if (allowedFlags.includes(BxKeyBindingButtonFlag.MOUSE_WHEEL)) {
                    valid = true;
                }
                break;

            case 'mousedown':
                handled = true;

                if (allowedFlags.includes(BxKeyBindingButtonFlag.MOUSE_CLICK)) {
                    valid = true;
                }
                break;

            case 'keyup':
                handled = true;

                if (allowedFlags.includes(BxKeyBindingButtonFlag.KEYBOARD_PRESS)) {
                    const keyboardEvent = e as KeyboardEvent;
                    valid = keyboardEvent.code !== 'Escape';

                    if (valid && allowedFlags.includes(BxKeyBindingButtonFlag.KEYBOARD_MODIFIER)) {
                        const key = keyboardEvent.key;
                        valid = key !== 'Control' && key !== 'Shift' && key !== 'Alt';
                        handled = valid;
                    }
                }

                break;
        }

        if (handled) {
            e.preventDefault();
            e.stopPropagation();

            if (valid) {
                this.$currentElm.bindKey(KeyHelper.getKeyFromEvent(e));
                this.stopCountdown();
            } else {
                // Restart countDown
                this.startCountdown();
            }

            // Prevent activating the key binding dialog by accident
            window.setTimeout(this.hide, 200);
        }
    }
}
