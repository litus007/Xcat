import type { KeyboardShortcutPresetRecord, PresetRecords } from "@/types/presets";
import { BxLogger } from "../bx-logger";
import { BasePresetsTable } from "./base-presets-table";
import { LocalDb } from "./local-db";
import { ShortcutAction } from "@/enums/shortcut-actions";
import { t } from "../translation";

export enum KeyboardShortcutDefaultId {
    OFF = 0,
    STANDARD = -1,

    DEFAULT = STANDARD,
};


export class KeyboardShortcutsTable extends BasePresetsTable<KeyboardShortcutPresetRecord> {
    private static instance: KeyboardShortcutsTable;
    public static getInstance = () => KeyboardShortcutsTable.instance ?? (KeyboardShortcutsTable.instance = new KeyboardShortcutsTable());
    private readonly LOG_TAG = 'KeyboardShortcutsTable';

    protected readonly TABLE_PRESETS: string = LocalDb.TABLE_KEYBOARD_SHORTCUTS;
    protected readonly DEFAULT_PRESETS: PresetRecords<KeyboardShortcutPresetRecord> = {
        [KeyboardShortcutDefaultId.DEFAULT]: {
            id: KeyboardShortcutDefaultId.DEFAULT,
            name: t('standard'),
            data: {
                mapping: {
                    [ShortcutAction.MKB_TOGGLE]: {
                        code: 'F8',
                    },
                    [ShortcutAction.STREAM_SCREENSHOT_CAPTURE]: {
                        code: 'Slash',
                    },
                },
            },
        },
    };

    readonly BLANK_PRESET_DATA = {
        mapping: {},
    };

    protected readonly DEFAULT_PRESET_ID = KeyboardShortcutDefaultId.DEFAULT;

    private constructor() {
        super(LocalDb.TABLE_KEYBOARD_SHORTCUTS);
        BxLogger.info(this.LOG_TAG, 'constructor()');
    }
}
