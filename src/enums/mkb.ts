export const enum MouseConstant {
    DEFAULT_PANNING_SENSITIVITY = 0.0010,
    DEFAULT_DEADZONE_COUNTERWEIGHT = 0.01,
    MAXIMUM_STICK_RANGE = 1.1,
}


export const enum MouseButtonCode {
    LEFT_CLICK = 'Mouse0',
    RIGHT_CLICK = 'Mouse2',
    MIDDLE_CLICK = 'Mouse1',
};


export const enum MouseMapTo {
    OFF = 0,
    LS = 1,
    RS = 2,
}


export const enum WheelCode {
    SCROLL_UP = 'ScrollUp',
    SCROLL_DOWN = 'ScrollDown',
    SCROLL_LEFT = 'ScrollLeft',
    SCROLL_RIGHT = 'ScrollRight',
};


export const enum MkbPresetKey {
    MOUSE_MAP_TO = 'mapTo',

    MOUSE_SENSITIVITY_X = 'sensitivityX',
    MOUSE_SENSITIVITY_Y = 'sensitivityY',

    MOUSE_DEADZONE_COUNTERWEIGHT = 'deadzoneCounterweight',
}


export const enum KeyModifier {
    CTRL = 1,
    ALT = 2,
    SHIFT = 4,
}
