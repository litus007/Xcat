import { MouseButtonCode, WheelCode } from "@/enums/mkb";

export const enum KeyModifier {
    CTRL = 1,
    SHIFT = 2,
    ALT = 4,
};

export type KeyEventInfo = {
    code: KeyCode | MouseButtonCode | WheelCode;
    modifiers?: number;
};

export class KeyHelper {
    private static readonly NON_PRINTABLE_KEYS = {
        Backquote: '`',
        Minus: '-',
        Equal: '=',
        BracketLeft: '[',
        BracketRight: ']',
        Backslash: '\\',
        Semicolon: ';',
        Quote: '\'',
        Comma: ',',
        Period: '.',
        Slash: '/',

        NumpadMultiply: 'Numpad *',
        NumpadAdd: 'Numpad +',
        NumpadSubtract: 'Numpad -',
        NumpadDecimal: 'Numpad .',
        NumpadDivide: 'Numpad /',
        NumpadEqual: 'Numpad =',

        // Mouse buttons
        [MouseButtonCode.LEFT_CLICK]: 'Left Click',
        [MouseButtonCode.RIGHT_CLICK]: 'Right Click',
        [MouseButtonCode.MIDDLE_CLICK]: 'Middle Click',

        [WheelCode.SCROLL_UP]: 'Scroll Up',
        [WheelCode.SCROLL_DOWN]: 'Scroll Down',
        [WheelCode.SCROLL_LEFT]: 'Scroll Left',
        [WheelCode.SCROLL_RIGHT]: 'Scroll Right',
    };

    static getKeyFromEvent(e: Event): KeyEventInfo | null {
        let code: KeyEventInfo['code'] | null = null;
        let modifiers;

        if (e instanceof KeyboardEvent) {
            code = (e.code || e.key) as KeyCode;

            // Modifiers
            modifiers = 0;
            modifiers ^= e.ctrlKey ? KeyModifier.CTRL : 0;
            modifiers ^= e.shiftKey ? KeyModifier.SHIFT : 0;
            modifiers ^= e.altKey ? KeyModifier.ALT : 0;

        } else if (e instanceof WheelEvent) {
            if (e.deltaY < 0) {
                code = WheelCode.SCROLL_UP;
            } else if (e.deltaY > 0) {
                code = WheelCode.SCROLL_DOWN;
            } else if (e.deltaX < 0) {
                code = WheelCode.SCROLL_LEFT;
            } else if (e.deltaX > 0) {
                code = WheelCode.SCROLL_RIGHT;
            }
        } else if (e instanceof MouseEvent) {
            code = 'Mouse' + e.button as MouseButtonCode;
        }

        if (code) {
            const results: KeyEventInfo = { code };
            if (modifiers) {
                results.modifiers = modifiers;
            }

            return results;
        }

        return null;
    }

    static getFullKeyCodeFromEvent(e: KeyboardEvent): string {
        const key = KeyHelper.getKeyFromEvent(e);
        return key ? `${key.code}:${key.modifiers || 0}` : '';
    }

    static parseFullKeyCode(str: string | undefined | null): KeyEventInfo | null {
        if (!str) {
            return null;
        }

        const tmp = str.split(':');

        const code = tmp[0] as KeyEventInfo['code'];
        const modifiers = parseInt(tmp[1] as string);

        return {
            code,
            modifiers,
        } as KeyEventInfo;
    }

    static codeToKeyName(key: KeyEventInfo): string {
        const { code, modifiers } = key;

        const text = [(
            KeyHelper.NON_PRINTABLE_KEYS[code as keyof typeof KeyHelper.NON_PRINTABLE_KEYS]
            ||
            (code.startsWith('Key') && code.substring(3))
            ||
            (code.startsWith('Digit') && code.substring(5))
            ||
            (code.startsWith('Numpad') && ('Numpad ' + code.substring(6)))
            ||
            (code.startsWith('Arrow') && ('Arrow ' + code.substring(5)))
            ||
            (code.endsWith('Lock') && (code.replace('Lock', ' Lock')))
            ||
            (code.endsWith('Left') && ('Left ' + code.replace('Left', '')))
            ||
            (code.endsWith('Right') && ('Right ' + code.replace('Right', '')))
            ||
            code
        )];

        if (modifiers && modifiers !== 0) {
            if (!code.startsWith('Control') && !code.startsWith('Shift') && !code.startsWith('Alt')) {
                // Shift
                if (modifiers & KeyModifier.SHIFT) {
                    text.unshift('Shift');
                }

                // Alt
                if (modifiers & KeyModifier.ALT) {
                    text.unshift('Alt');
                }

                // Ctrl
                if (modifiers & KeyModifier.CTRL) {
                    text.unshift('Ctrl');
                }
            }
        }

        return text.join(' + ');
    }
}
