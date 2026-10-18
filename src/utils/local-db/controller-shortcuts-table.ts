import type { ControllerShortcutPresetRecord, PresetRecords } from "@/types/presets";
import { BxLogger } from "../bx-logger";
import { BasePresetsTable } from "./base-presets-table";
import { LocalDb } from "./local-db";
import { GamepadKey } from "@/enums/gamepad";
import { ShortcutAction } from "@/enums/shortcut-actions";
import { AppInterface } from "../global";

export enum ControllerShortcutDefaultId {
    TYPE_A = -1,
    TYPE_B = -2,

    DEFAULT = TYPE_A,
};


export class ControllerShortcutsTable extends BasePresetsTable<ControllerShortcutPresetRecord> {
    private static instance: ControllerShortcutsTable;
    public static getInstance = () => ControllerShortcutsTable.instance ?? (ControllerShortcutsTable.instance = new ControllerShortcutsTable());
    private readonly LOG_TAG = 'ControllerShortcutsTable';

    protected readonly TABLE_PRESETS: string = LocalDb.TABLE_CONTROLLER_SHORTCUTS;
    protected readonly DEFAULT_PRESETS: PresetRecords<ControllerShortcutPresetRecord> = {
        [ControllerShortcutDefaultId.TYPE_A]: {
            id: ControllerShortcutDefaultId.TYPE_A,
            name: 'Type A',
            data: {
                mapping: {
                    [GamepadKey.Y]: AppInterface ? ShortcutAction.DEVICE_VOLUME_INC : ShortcutAction.STREAM_VOLUME_INC,
                    [GamepadKey.A]: AppInterface ? ShortcutAction.DEVICE_VOLUME_DEC : ShortcutAction.STREAM_VOLUME_DEC,
                    [GamepadKey.X]: ShortcutAction.STREAM_STATS_TOGGLE,
                    [GamepadKey.B]: AppInterface ? ShortcutAction.DEVICE_SOUND_TOGGLE : ShortcutAction.STREAM_SOUND_TOGGLE,
                    [GamepadKey.RB]: ShortcutAction.STREAM_SCREENSHOT_CAPTURE,
                    [GamepadKey.START]: ShortcutAction.STREAM_MENU_SHOW,
                },
            },
        },

        [ControllerShortcutDefaultId.TYPE_B]: {
            id: ControllerShortcutDefaultId.TYPE_B,
            name: 'Type B',
            data: {
                mapping: {
                    [GamepadKey.UP]: AppInterface ? ShortcutAction.DEVICE_VOLUME_INC : ShortcutAction.STREAM_VOLUME_INC,
                    [GamepadKey.DOWN]: AppInterface ? ShortcutAction.DEVICE_VOLUME_DEC : ShortcutAction.STREAM_VOLUME_DEC,
                    [GamepadKey.RIGHT]: ShortcutAction.STREAM_STATS_TOGGLE,
                    [GamepadKey.LEFT]: AppInterface ? ShortcutAction.DEVICE_SOUND_TOGGLE : ShortcutAction.STREAM_SOUND_TOGGLE,
                    [GamepadKey.LB]: ShortcutAction.STREAM_SCREENSHOT_CAPTURE,
                    [GamepadKey.SELECT]: ShortcutAction.STREAM_MENU_SHOW,
                },
            },
        },
    };

    readonly BLANK_PRESET_DATA = {
        mapping: {},
    };

    protected readonly DEFAULT_PRESET_ID = ControllerShortcutDefaultId.DEFAULT;

    private constructor() {
        super(LocalDb.TABLE_CONTROLLER_SHORTCUTS);
        BxLogger.info(this.LOG_TAG, 'constructor()');
    }
}
