import type { GamepadKey } from "@/enums/gamepad";
import { MouseButtonCode, WheelCode } from "@/enums/mkb";
import { MouseMapTo, MkbPresetKey, type KeyCode } from "@/enums/mkb";
import type { ShortcutAction } from "@/enums/shortcut-actions";
import type { KeyEventInfo } from "@/modules/mkb/key-helper";

interface PresetRecord extends BaseRecord {
    id: number;
    name: string;
    data: {};
};

interface PresetRecords<T extends PresetRecord> {
    [key: number]: T;
}

// MKB
type MkbPresetData = {
    mapping: PartialRecord<GamepadKey, Array<KeyCode | MouseButtonCode | WheelCode | null>>;
    mouse: Omit<{
        [index in MkbPresetKey]: number;
    }, MkbPresetKey.MOUSE_MAP_TO> & {
        [MkbPresetKey.MOUSE_MAP_TO]: MouseMapTo;
    };
};

type MkbConvertedPresetData = MkbPresetData & {
    mapping: Record<string, number?>;
};

interface MkbPresetRecord extends PresetRecord {
    data: MkbPresetData;
};

interface MkbConvertedPresetRecord extends PresetRecord {
    data: MkbConvertedPresetData;
};

// Controller shortcuts
interface ControllerShortcutPresetRecord extends PresetRecord {
    data: ControllerShortcutPresetData;
};

type ControllerShortcutPresetData = {
    mapping: PartialRecord<GamepadKey, ShortcutAction>,
};

// Keyboard shortcuts
interface KeyboardShortcutPresetRecord extends PresetRecord {
    data: KeyboardShortcutPresetData;
};

type KeyboardShortcutPresetData = {
    mapping: PartialRecord<ShortcutAction, KeyEventInfo>,
};

type KeyboardShortcutConvertedPresetData = KeyboardShortcutPresetData & {
    mapping: { [key: string]: ShortcutAction };
};

// All presets
interface AllPresets<T extends PresetRecord> {
    default: Array<number>;
    custom: Array<number>;
    data: { [key: string]: T };
};

interface AllPresetsData<T extends PresetRecord> {
    [presetId: string]: T['data'];
};

// Controller customization
type ControllerCustomizationPresetData = {
    mapping: PartialRecord<GamepadKey, GamepadKey | false | undefined>;
    settings: {
        leftTriggerRange?: [number, number];
        rightTriggerRange?: [number, number];

        leftStickDeadzone?: [number, number];
        rightStickDeadzone?: [number, number];

        vibrationIntensity: number;
    },
};

interface ControllerCustomizationPresetRecord extends PresetRecord {
    data: ControllerCustomizationPresetData;
};

type ControllerCustomizationConvertedPresetData = {
    mapping: PartialRecord<keyof XcloudGamepad, keyof XcloudGamepad | false>;
    ranges: {
        [key in keyof Pick<XcloudGamepad, 'LeftTrigger' | 'RightTrigger' | 'LeftThumb' | 'RightThumb'>]?: [number, number];
    };
    vibrationIntensity: number;
}
