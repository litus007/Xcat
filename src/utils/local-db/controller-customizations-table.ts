import type { ControllerCustomizationPresetData, ControllerCustomizationPresetRecord, PresetRecords } from "@/types/presets";
import { LocalDb } from "./local-db";
import { BasePresetsTable } from "./base-presets-table";
import { GamepadKey } from "@/enums/gamepad";

export const enum ControllerCustomizationDefaultPresetId {
    OFF = 0,
    BAYX = -1,

    DEFAULT = OFF,
};

export class ControllerCustomizationsTable extends BasePresetsTable<ControllerCustomizationPresetRecord> {
    private static instance: ControllerCustomizationsTable;
    public static getInstance = () => ControllerCustomizationsTable.instance ?? (ControllerCustomizationsTable.instance = new ControllerCustomizationsTable(LocalDb.TABLE_CONTROLLER_CUSTOMIZATIONS));

    protected readonly TABLE_PRESETS = LocalDb.TABLE_CONTROLLER_CUSTOMIZATIONS;
    protected DEFAULT_PRESETS: PresetRecords<ControllerCustomizationPresetRecord> = {
        [ControllerCustomizationDefaultPresetId.BAYX]: {
            id: ControllerCustomizationDefaultPresetId.BAYX,
            name: 'ABXY ⇄ BAYX',
            data: {
                mapping: {
                    [GamepadKey.A]: GamepadKey.B,
                    [GamepadKey.B]: GamepadKey.A,
                    [GamepadKey.X]: GamepadKey.Y,
                    [GamepadKey.Y]: GamepadKey.X,
                },

                settings: {
                    leftStickDeadzone: [0, 100],
                    rightStickDeadzone: [0, 100],

                    leftTriggerRange: [0, 100],
                    rightTriggerRange: [0, 100],

                    vibrationIntensity: 100,
                },
            },
        },
    };

    readonly BLANK_PRESET_DATA = {
        mapping: {},
        settings: {
            leftTriggerRange: [0, 100],
            rightTriggerRange: [0, 100],
            leftStickDeadzone: [0, 100],
            rightStickDeadzone: [0, 100],

            vibrationIntensity: 100,
        },
    } satisfies ControllerCustomizationPresetData;

    protected DEFAULT_PRESET_ID = ControllerCustomizationDefaultPresetId.DEFAULT;
}
