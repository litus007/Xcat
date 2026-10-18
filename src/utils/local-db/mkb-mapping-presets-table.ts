import { LocalDb } from "./local-db";
import { BxLogger } from "../bx-logger";
import { BasePresetsTable } from "./base-presets-table";
import type { MkbPresetRecord, PresetRecords } from "@/types/presets";
import { MkbPresetKey, MouseMapTo, MouseButtonCode } from "@/enums/mkb";
import { GamepadKey } from "@/enums/gamepad";
import { t } from "../translation";

export const enum MkbMappingDefaultPresetId {
    OFF = 0,
    STANDARD = -1,
    SHOOTER = -2,

    DEFAULT = STANDARD,
};

export class MkbMappingPresetsTable extends BasePresetsTable<MkbPresetRecord> {
    private static instance: MkbMappingPresetsTable;
    public static getInstance = () => MkbMappingPresetsTable.instance ?? (MkbMappingPresetsTable.instance = new MkbMappingPresetsTable());
    private readonly LOG_TAG = 'MkbMappingPresetsTable';

    protected readonly TABLE_PRESETS = LocalDb.TABLE_VIRTUAL_CONTROLLERS;
    protected readonly DEFAULT_PRESETS: PresetRecords<MkbPresetRecord> = {
        [MkbMappingDefaultPresetId.STANDARD]: {
            id: MkbMappingDefaultPresetId.STANDARD,
            name: t('standard'),
            data: {
                mapping: {
                    [GamepadKey.HOME]: ['Backquote'],

                    [GamepadKey.UP]: ['ArrowUp', 'Digit1'],
                    [GamepadKey.DOWN]: ['ArrowDown', 'Digit2'],
                    [GamepadKey.LEFT]: ['ArrowLeft', 'Digit3'],
                    [GamepadKey.RIGHT]: ['ArrowRight', 'Digit4'],

                    [GamepadKey.LS_UP]: ['KeyW'],
                    [GamepadKey.LS_DOWN]: ['KeyS'],
                    [GamepadKey.LS_LEFT]: ['KeyA'],
                    [GamepadKey.LS_RIGHT]: ['KeyD'],

                    [GamepadKey.RS_UP]: ['KeyU'],
                    [GamepadKey.RS_DOWN]: ['KeyJ'],
                    [GamepadKey.RS_LEFT]: ['KeyH'],
                    [GamepadKey.RS_RIGHT]: ['KeyK'],

                    [GamepadKey.A]: ['Space', 'KeyE'],
                    [GamepadKey.X]: ['KeyR'],
                    [GamepadKey.B]: ['KeyC', 'Backspace'],
                    [GamepadKey.Y]: ['KeyV'],

                    [GamepadKey.START]: ['Enter'],
                    [GamepadKey.SELECT]: ['Tab'],

                    [GamepadKey.LB]: ['KeyQ'],
                    [GamepadKey.RB]: ['KeyF'],

                    [GamepadKey.RT]: [MouseButtonCode.LEFT_CLICK],
                    [GamepadKey.LT]: [MouseButtonCode.RIGHT_CLICK],

                    [GamepadKey.L3]: ['KeyX'],
                    [GamepadKey.R3]: ['KeyZ'],
                },
                mouse: {
                    [MkbPresetKey.MOUSE_MAP_TO]: MouseMapTo.RS,
                    [MkbPresetKey.MOUSE_SENSITIVITY_X]: 100,
                    [MkbPresetKey.MOUSE_SENSITIVITY_Y]: 100,
                    [MkbPresetKey.MOUSE_DEADZONE_COUNTERWEIGHT]: 20,
                },
            },
        },

        [MkbMappingDefaultPresetId.SHOOTER]: {
            id: MkbMappingDefaultPresetId.SHOOTER,
            name: 'Shooter',
            data: {
                mapping: {
                    [GamepadKey.HOME]: ['Backquote'],

                    [GamepadKey.UP]: ['ArrowUp'],
                    [GamepadKey.DOWN]: ['ArrowDown'],
                    [GamepadKey.LEFT]: ['ArrowLeft'],
                    [GamepadKey.RIGHT]: ['ArrowRight'],

                    [GamepadKey.LS_UP]: ['KeyW'],
                    [GamepadKey.LS_DOWN]: ['KeyS'],
                    [GamepadKey.LS_LEFT]: ['KeyA'],
                    [GamepadKey.LS_RIGHT]: ['KeyD'],

                    [GamepadKey.RS_UP]: ['KeyI'],
                    [GamepadKey.RS_DOWN]: ['KeyK'],
                    [GamepadKey.RS_LEFT]: ['KeyJ'],
                    [GamepadKey.RS_RIGHT]: ['KeyL'],

                    [GamepadKey.A]: ['Space', 'KeyE'],
                    [GamepadKey.X]: ['KeyR'],
                    [GamepadKey.B]: ['ControlLeft', 'Backspace'],
                    [GamepadKey.Y]: ['KeyV'],

                    [GamepadKey.START]: ['Enter'],
                    [GamepadKey.SELECT]: ['Tab'],

                    [GamepadKey.LB]: ['KeyC', 'KeyG'],
                    [GamepadKey.RB]: ['KeyQ'],

                    [GamepadKey.RT]: [MouseButtonCode.LEFT_CLICK],
                    [GamepadKey.LT]: [MouseButtonCode.RIGHT_CLICK],

                    [GamepadKey.L3]: ['ShiftLeft'],
                    [GamepadKey.R3]: ['KeyF'],
                },
                mouse: {
                    [MkbPresetKey.MOUSE_MAP_TO]: MouseMapTo.RS,
                    [MkbPresetKey.MOUSE_SENSITIVITY_X]: 100,
                    [MkbPresetKey.MOUSE_SENSITIVITY_Y]: 100,
                    [MkbPresetKey.MOUSE_DEADZONE_COUNTERWEIGHT]: 20,
                },
            },
        },
    };

    readonly BLANK_PRESET_DATA = {
        mapping: {},
        mouse: {
            [MkbPresetKey.MOUSE_MAP_TO]: MouseMapTo.RS,
            [MkbPresetKey.MOUSE_SENSITIVITY_X]: 100,
            [MkbPresetKey.MOUSE_SENSITIVITY_Y]: 100,
            [MkbPresetKey.MOUSE_DEADZONE_COUNTERWEIGHT]: 20,
        },
    };

    protected readonly DEFAULT_PRESET_ID = MkbMappingDefaultPresetId.DEFAULT;

    private constructor() {
        super(LocalDb.TABLE_VIRTUAL_CONTROLLERS);
        BxLogger.info(this.LOG_TAG, 'constructor()');
    }
}
