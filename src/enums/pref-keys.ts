import type { BaseSettingsStorage } from "@/utils/settings-storages/base-settings-storage";
import type { BlockFeature, CodecProfile, DeviceVibrationMode, GameBarPosition, LoadingScreenRocket, NativeMkbMode, StreamPlayerType, StreamResolution, StreamStat, StreamStatPosition, StreamVideoProcessing, StreamVideoProcessingMode, TouchControllerMode, TouchControllerStyleCustom, TouchControllerStyleStandard, UiLayout, UiSection, UiTheme, VideoPosition, VideoPowerPreference, VideoRatio } from "./pref-values"

export const enum StorageKey {
    GLOBAL = 'BetterXcloud',
    STREAM = 'BetterXcloud.Stream',

    PATCHES_CACHE = 'BetterXcloud.Patches.Cache',
    PATCHES_SIGNATURE = 'BetterXcloud.Patches.Cache.Signature',
    USER_AGENT = 'BetterXcloud.UserAgent',

    GAMEPAD_PROFILES = 'BetterXcloud.GamepadProfiles',
    CUSTOM_TOUCH_LAYOUTS = 'BetterXcloud.CustomTouchLayouts',
    LIST_CUSTOM_TOUCH_LAYOUTS = 'BetterXcloud.Lists.CustomTouchLayouts',
    LIST_FORCE_NATIVE_MKB = 'BetterXcloud.Lists.ForceNativeMkb',
    LIST_LOCAL_CO_OP = 'BetterXcloud.Lists.LocalCoOp',
}


export const enum GlobalPref {


    SERVER_REGION = 'server.region',
    SERVER_BYPASS_RESTRICTION = 'server.bypassRestriction',
    SERVER_PREFER_IPV6 = 'server.ipv6.prefer',

    STREAM_PREFERRED_LOCALE = 'stream.locale',
    STREAM_RESOLUTION = 'stream.video.resolution',
    STREAM_CODEC_PROFILE = 'stream.video.codecProfile',
    STREAM_MAX_VIDEO_BITRATE = 'stream.video.maxBitrate',
    STREAM_COMBINE_SOURCES = 'stream.video.combineAudio',
    STREAM_PREVENT_RESOLUTION_DROPS = 'stream.video.preventResolutionDrops',

    USER_AGENT_PROFILE = 'userAgent.profile',

    TOUCH_CONTROLLER_MODE = 'touchController.mode',
    TOUCH_CONTROLLER_AUTO_OFF = 'touchController.autoOff',
    TOUCH_CONTROLLER_DEFAULT_OPACITY = 'touchController.opacity.default',
    TOUCH_CONTROLLER_STYLE_STANDARD = 'touchController.style.standard',
    TOUCH_CONTROLLER_STYLE_CUSTOM = 'touchController.style.custom',

    GAME_BAR_POSITION = 'gameBar.position',

    NATIVE_MKB_MODE = 'nativeMkb.mode',
    NATIVE_MKB_FORCED_GAMES = 'nativeMkb.forcedGames',

    MKB_ENABLED = 'mkb.enabled',
    GAMEPAD_ADAPTER_ENABLED = 'gamepadAdapter.enabled',
    GAMEPAD_ADAPTER_SWAP_FACE = 'gamepadAdapter.swapFace',
    GAMEPAD_ADAPTER_DEADZONE = 'gamepadAdapter.deadzone',
    VIRTUAL_PAD_ENABLED = 'virtualPad.enabled',
    VIRTUAL_PAD_OPACITY = 'virtualPad.opacity',
    VIRTUAL_PAD_SIZE = 'virtualPad.size',
    VIRTUAL_PAD_HAPTICS = 'virtualPad.haptics',
    NETWORK_PROFILES_ENABLED = 'network.profiles.enabled',
    NETWORK_PROFILE_WIFI_RESOLUTION = 'network.profile.wifi.resolution',
    NETWORK_PROFILE_WIFI_BITRATE = 'network.profile.wifi.bitrate',
    NETWORK_PROFILE_MOBILE_RESOLUTION = 'network.profile.mobile.resolution',
    NETWORK_PROFILE_MOBILE_BITRATE = 'network.profile.mobile.bitrate',
    NETWORK_INDICATOR = 'network.indicator',
    NETWORK_AUTO_RECONNECT = 'network.autoReconnect',
    NETWORK_LOW_LATENCY = 'network.lowLatency',
    RELAY_ENABLED = 'relay.enabled',
    RELAY_PORT = 'relay.port',
    RELAY_VIEWER_MODE = 'relay.viewerMode',
    RELAY_BITRATE = 'relay.bitrate',
    MKB_HIDE_IDLE_CURSOR = 'mkb.cursor.hideIdle',

    SCREENSHOT_APPLY_FILTERS = 'screenshot.applyFilters',

    BLOCK_TRACKING = 'block.tracking',
    BLOCK_FEATURES = 'block.features',

    LOADING_SCREEN_GAME_ART = 'loadingScreen.gameArt.show',
    LOADING_SCREEN_SHOW_WAIT_TIME = 'loadingScreen.waitTime.show',
    LOADING_SCREEN_ROCKET = 'loadingScreen.rocket',

    UI_CONTROLLER_FRIENDLY = 'ui.controllerFriendly',
    UI_LAYOUT = 'ui.layout',
    UI_SCROLLBAR_HIDE = 'ui.hideScrollbar',
    UI_HIDE_SECTIONS = 'ui.hideSections',

    UI_GAME_CARD_SHOW_WAIT_TIME = 'ui.gameCard.waitTime.show',
    UI_SIMPLIFY_STREAM_MENU = 'ui.streamMenu.simplify',
    UI_DISABLE_FEEDBACK_DIALOG = 'ui.feedbackDialog.disabled',
    UI_CONTROLLER_SHOW_STATUS = 'ui.controllerStatus.show',

    UI_SKIP_SPLASH_VIDEO = 'ui.splashVideo.skip',
    UI_HIDE_SYSTEM_MENU_ICON = 'ui.systemMenu.hideHandle',
    UI_REDUCE_ANIMATIONS = 'ui.reduceAnimations',
    UI_IMAGE_QUALITY = 'ui.imageQuality',
    UI_THEME = 'ui.theme',

    AUDIO_MIC_ON_PLAYING = 'audio.mic.onPlaying',
    AUDIO_VOLUME_CONTROL_ENABLED = 'audio.volume.booster.enabled',

    REMOTE_PLAY_STREAM_RESOLUTION = 'xhome.video.resolution',
    REMOTE_PLAY_PREFER_IPV6 = 'xhome.ipv6.prefer',

    GAME_FORTNITE_FORCE_CONSOLE = 'game.fortnite.forceConsole',
}

export type GlobalPrefTypeMap = {
    [GlobalPref.AUDIO_MIC_ON_PLAYING]: boolean;
    [GlobalPref.AUDIO_VOLUME_CONTROL_ENABLED]: boolean;
    [GlobalPref.BLOCK_FEATURES]: BlockFeature[];
    [GlobalPref.BLOCK_TRACKING]: boolean;
    [GlobalPref.GAME_BAR_POSITION]: GameBarPosition;
    [GlobalPref.GAME_FORTNITE_FORCE_CONSOLE]: boolean;
    [GlobalPref.LOADING_SCREEN_GAME_ART]: boolean;
    [GlobalPref.LOADING_SCREEN_ROCKET]: LoadingScreenRocket;
    [GlobalPref.LOADING_SCREEN_SHOW_WAIT_TIME]: boolean;
    [GlobalPref.MKB_ENABLED]: boolean;
    [GlobalPref.GAMEPAD_ADAPTER_ENABLED]: boolean;
    [GlobalPref.GAMEPAD_ADAPTER_SWAP_FACE]: boolean;
    [GlobalPref.GAMEPAD_ADAPTER_DEADZONE]: number;
    [GlobalPref.VIRTUAL_PAD_ENABLED]: boolean;
    [GlobalPref.VIRTUAL_PAD_OPACITY]: number;
    [GlobalPref.VIRTUAL_PAD_SIZE]: number;
    [GlobalPref.VIRTUAL_PAD_HAPTICS]: boolean;
    [GlobalPref.NETWORK_PROFILES_ENABLED]: boolean;
    [GlobalPref.NETWORK_PROFILE_WIFI_RESOLUTION]: string;
    [GlobalPref.NETWORK_PROFILE_WIFI_BITRATE]: number;
    [GlobalPref.NETWORK_PROFILE_MOBILE_RESOLUTION]: string;
    [GlobalPref.NETWORK_PROFILE_MOBILE_BITRATE]: number;
    [GlobalPref.NETWORK_INDICATOR]: boolean;
    [GlobalPref.NETWORK_AUTO_RECONNECT]: boolean;
    [GlobalPref.NETWORK_LOW_LATENCY]: boolean;
    [GlobalPref.RELAY_ENABLED]: boolean;
    [GlobalPref.RELAY_PORT]: number;
    [GlobalPref.RELAY_VIEWER_MODE]: string;
    [GlobalPref.RELAY_BITRATE]: number;
    [GlobalPref.MKB_HIDE_IDLE_CURSOR]: boolean;
    [GlobalPref.NATIVE_MKB_FORCED_GAMES]: string[];
    [GlobalPref.NATIVE_MKB_MODE]: NativeMkbMode;
    [GlobalPref.REMOTE_PLAY_STREAM_RESOLUTION]: StreamResolution;
    [GlobalPref.REMOTE_PLAY_PREFER_IPV6]: boolean;
    [GlobalPref.SCREENSHOT_APPLY_FILTERS]: boolean;
    [GlobalPref.SERVER_BYPASS_RESTRICTION]: string;
    [GlobalPref.SERVER_PREFER_IPV6]: boolean;
    [GlobalPref.SERVER_REGION]: string;
    [GlobalPref.STREAM_CODEC_PROFILE]: CodecProfile;
    [GlobalPref.STREAM_COMBINE_SOURCES]: boolean;
    [GlobalPref.STREAM_MAX_VIDEO_BITRATE]: number;
    [GlobalPref.STREAM_PREFERRED_LOCALE]: StreamPreferredLocale;
    [GlobalPref.STREAM_RESOLUTION]: StreamResolution;
    [GlobalPref.STREAM_PREVENT_RESOLUTION_DROPS]: boolean;
    [GlobalPref.TOUCH_CONTROLLER_AUTO_OFF]: boolean;
    [GlobalPref.TOUCH_CONTROLLER_DEFAULT_OPACITY]: number;
    [GlobalPref.TOUCH_CONTROLLER_MODE]: TouchControllerMode;
    [GlobalPref.TOUCH_CONTROLLER_STYLE_CUSTOM]: TouchControllerStyleCustom;
    [GlobalPref.TOUCH_CONTROLLER_STYLE_STANDARD]: TouchControllerStyleStandard;
    [GlobalPref.UI_CONTROLLER_FRIENDLY]: boolean;
    [GlobalPref.UI_CONTROLLER_SHOW_STATUS]: boolean;
    [GlobalPref.UI_DISABLE_FEEDBACK_DIALOG]: boolean;
    [GlobalPref.UI_GAME_CARD_SHOW_WAIT_TIME]: boolean;
    [GlobalPref.UI_HIDE_SECTIONS]: UiSection[];
    [GlobalPref.UI_HIDE_SYSTEM_MENU_ICON]: boolean;
    [GlobalPref.UI_IMAGE_QUALITY]: number;
    [GlobalPref.UI_LAYOUT]: UiLayout;
    [GlobalPref.UI_REDUCE_ANIMATIONS]: boolean;
    [GlobalPref.UI_SCROLLBAR_HIDE]: boolean;
    [GlobalPref.UI_SIMPLIFY_STREAM_MENU]: boolean;
    [GlobalPref.UI_SKIP_SPLASH_VIDEO]: boolean;
    [GlobalPref.UI_THEME]: UiTheme;

    [GlobalPref.USER_AGENT_PROFILE]: string;
}

export const enum StreamPref {
    LOCAL_CO_OP_ENABLED = 'localCoOp.enabled',

    DEVICE_VIBRATION_MODE = 'deviceVibration.mode',
    DEVICE_VIBRATION_INTENSITY = 'deviceVibration.intensity',

    CONTROLLER_POLLING_RATE = 'controller.pollingRate',
    CONTROLLER_SETTINGS = 'controller.settings',

    NATIVE_MKB_SCROLL_HORIZONTAL_SENSITIVITY = 'nativeMkb.scroll.sensitivityX',
    NATIVE_MKB_SCROLL_VERTICAL_SENSITIVITY = 'nativeMkb.scroll.sensitivityY',

    MKB_P1_MAPPING_PRESET_ID = 'mkb.p1.preset.mappingId',
    MKB_P1_SLOT = 'mkb.p1.slot',
    MKB_P2_MAPPING_PRESET_ID = 'mkb.p2.preset.mappingId',
    MKB_P2_SLOT = 'mkb.p2.slot',

    KEYBOARD_SHORTCUTS_IN_GAME_PRESET_ID = 'keyboardShortcuts.preset.inGameId',

    VIDEO_PLAYER_TYPE = 'video.player.type',
    VIDEO_POWER_PREFERENCE = 'video.player.powerPreference',
    VIDEO_PROCESSING = 'video.processing',
    VIDEO_PROCESSING_MODE = 'video.processing.mode',
    VIDEO_SHARPNESS = 'video.processing.sharpness',
    VIDEO_MAX_FPS = 'video.maxFps',
    VIDEO_RATIO = 'video.ratio',
    VIDEO_BRIGHTNESS = 'video.brightness',
    VIDEO_CONTRAST = 'video.contrast',
    VIDEO_SATURATION = 'video.saturation',
    VIDEO_POSITION = 'video.position',

    AUDIO_VOLUME = 'audio.volume',

    STATS_ITEMS = 'stats.items',
    STATS_SHOW_WHEN_PLAYING = 'stats.showWhenPlaying',
    STATS_QUICK_GLANCE_ENABLED = 'stats.quickGlance.enabled',
    STATS_POSITION = 'stats.position',
    STATS_TEXT_SIZE = 'stats.textSize',
    STATS_OPACITY_ALL = 'stats.opacity.all',
    STATS_OPACITY_BACKGROUND = 'stats.opacity.background',
    STATS_CONDITIONAL_FORMATTING = 'stats.colors',
}

export type StreamPrefTypeMap = {
    [StreamPref.AUDIO_VOLUME]: number;
    [StreamPref.CONTROLLER_POLLING_RATE]: number;
    [StreamPref.CONTROLLER_SETTINGS]: ControllerSettings;
    [StreamPref.DEVICE_VIBRATION_INTENSITY]: number;
    [StreamPref.DEVICE_VIBRATION_MODE]: DeviceVibrationMode;
    [StreamPref.KEYBOARD_SHORTCUTS_IN_GAME_PRESET_ID]: number;
    [StreamPref.LOCAL_CO_OP_ENABLED]: boolean;
    [StreamPref.MKB_P1_MAPPING_PRESET_ID]: number;
    [StreamPref.MKB_P1_SLOT]: number;
    [StreamPref.MKB_P2_MAPPING_PRESET_ID]: number;
    [StreamPref.MKB_P2_SLOT]: number;
    [StreamPref.NATIVE_MKB_SCROLL_HORIZONTAL_SENSITIVITY]: number;
    [StreamPref.NATIVE_MKB_SCROLL_VERTICAL_SENSITIVITY]: number;
    [StreamPref.STATS_CONDITIONAL_FORMATTING]: boolean;
    [StreamPref.STATS_ITEMS]: StreamStat[];
    [StreamPref.STATS_OPACITY_ALL]: number;
    [StreamPref.STATS_OPACITY_BACKGROUND]: number;
    [StreamPref.STATS_POSITION]: StreamStatPosition;
    [StreamPref.STATS_QUICK_GLANCE_ENABLED]: boolean;
    [StreamPref.STATS_SHOW_WHEN_PLAYING]: boolean;
    [StreamPref.STATS_TEXT_SIZE]: string;
    [StreamPref.VIDEO_BRIGHTNESS]: number;
    [StreamPref.VIDEO_CONTRAST]: number;
    [StreamPref.VIDEO_MAX_FPS]: number;
    [StreamPref.VIDEO_PLAYER_TYPE]: StreamPlayerType;
    [StreamPref.VIDEO_POSITION]: VideoPosition;
    [StreamPref.VIDEO_POWER_PREFERENCE]: VideoPowerPreference;
    [StreamPref.VIDEO_PROCESSING]: StreamVideoProcessing;
    [StreamPref.VIDEO_PROCESSING_MODE]: StreamVideoProcessingMode;
    [StreamPref.VIDEO_RATIO]: VideoRatio;
    [StreamPref.VIDEO_SATURATION]: number;
    [StreamPref.VIDEO_SHARPNESS]: number;
}

export type AllPrefs = GlobalPref | StreamPref;

export const ALL_PREFS: {
    global: GlobalPref[],
    stream: StreamPref[],
} = {
    global: [
        GlobalPref.AUDIO_MIC_ON_PLAYING,
        GlobalPref.AUDIO_VOLUME_CONTROL_ENABLED,
        GlobalPref.BLOCK_FEATURES,
        GlobalPref.BLOCK_TRACKING,
        GlobalPref.GAME_BAR_POSITION,
        GlobalPref.GAME_FORTNITE_FORCE_CONSOLE,
        GlobalPref.LOADING_SCREEN_GAME_ART,
        GlobalPref.LOADING_SCREEN_ROCKET,
        GlobalPref.LOADING_SCREEN_SHOW_WAIT_TIME,
        GlobalPref.MKB_ENABLED,
        GlobalPref.GAMEPAD_ADAPTER_ENABLED,
        GlobalPref.GAMEPAD_ADAPTER_SWAP_FACE,
        GlobalPref.GAMEPAD_ADAPTER_DEADZONE,
        GlobalPref.VIRTUAL_PAD_ENABLED,
        GlobalPref.VIRTUAL_PAD_OPACITY,
        GlobalPref.VIRTUAL_PAD_SIZE,
        GlobalPref.VIRTUAL_PAD_HAPTICS,
        GlobalPref.NETWORK_PROFILES_ENABLED,
        GlobalPref.NETWORK_PROFILE_WIFI_RESOLUTION,
        GlobalPref.NETWORK_PROFILE_WIFI_BITRATE,
        GlobalPref.NETWORK_PROFILE_MOBILE_RESOLUTION,
        GlobalPref.NETWORK_PROFILE_MOBILE_BITRATE,
        GlobalPref.NETWORK_INDICATOR,
        GlobalPref.NETWORK_AUTO_RECONNECT,
        GlobalPref.NETWORK_LOW_LATENCY,
        GlobalPref.RELAY_ENABLED,
        GlobalPref.RELAY_PORT,
        GlobalPref.RELAY_VIEWER_MODE,
        GlobalPref.RELAY_BITRATE,
        GlobalPref.MKB_HIDE_IDLE_CURSOR,
        GlobalPref.NATIVE_MKB_FORCED_GAMES,
        GlobalPref.NATIVE_MKB_MODE,
        GlobalPref.REMOTE_PLAY_STREAM_RESOLUTION,
        GlobalPref.REMOTE_PLAY_PREFER_IPV6,
        GlobalPref.SCREENSHOT_APPLY_FILTERS,
        GlobalPref.SERVER_BYPASS_RESTRICTION,
        GlobalPref.SERVER_PREFER_IPV6,
        GlobalPref.SERVER_REGION,
        GlobalPref.STREAM_CODEC_PROFILE,
        GlobalPref.STREAM_COMBINE_SOURCES,
        GlobalPref.STREAM_MAX_VIDEO_BITRATE,
        GlobalPref.STREAM_PREFERRED_LOCALE,
        GlobalPref.STREAM_RESOLUTION,
        GlobalPref.STREAM_PREVENT_RESOLUTION_DROPS,
        GlobalPref.TOUCH_CONTROLLER_AUTO_OFF,
        GlobalPref.TOUCH_CONTROLLER_DEFAULT_OPACITY,
        GlobalPref.TOUCH_CONTROLLER_MODE,
        GlobalPref.TOUCH_CONTROLLER_STYLE_CUSTOM,
        GlobalPref.TOUCH_CONTROLLER_STYLE_STANDARD,
        GlobalPref.UI_CONTROLLER_FRIENDLY,
        GlobalPref.UI_CONTROLLER_SHOW_STATUS,
        GlobalPref.UI_DISABLE_FEEDBACK_DIALOG,
        GlobalPref.UI_GAME_CARD_SHOW_WAIT_TIME,
        GlobalPref.UI_HIDE_SECTIONS,
        GlobalPref.UI_HIDE_SYSTEM_MENU_ICON,
        GlobalPref.UI_IMAGE_QUALITY,
        GlobalPref.UI_LAYOUT,
        GlobalPref.UI_REDUCE_ANIMATIONS,
        GlobalPref.UI_SCROLLBAR_HIDE,
        GlobalPref.UI_SIMPLIFY_STREAM_MENU,
        GlobalPref.UI_SKIP_SPLASH_VIDEO,
        GlobalPref.UI_THEME,

        GlobalPref.USER_AGENT_PROFILE,
    ],
    stream: [
        StreamPref.AUDIO_VOLUME,
        StreamPref.CONTROLLER_POLLING_RATE,
        StreamPref.CONTROLLER_SETTINGS,
        StreamPref.DEVICE_VIBRATION_INTENSITY,
        StreamPref.DEVICE_VIBRATION_MODE,
        StreamPref.KEYBOARD_SHORTCUTS_IN_GAME_PRESET_ID,
        StreamPref.LOCAL_CO_OP_ENABLED,
        StreamPref.MKB_P1_MAPPING_PRESET_ID,
        StreamPref.MKB_P1_SLOT,
        StreamPref.MKB_P2_MAPPING_PRESET_ID,
        StreamPref.MKB_P2_SLOT,
        StreamPref.NATIVE_MKB_SCROLL_HORIZONTAL_SENSITIVITY,
        StreamPref.NATIVE_MKB_SCROLL_VERTICAL_SENSITIVITY,
        StreamPref.STATS_CONDITIONAL_FORMATTING,
        StreamPref.STATS_ITEMS,
        StreamPref.STATS_OPACITY_ALL,
        StreamPref.STATS_OPACITY_BACKGROUND,
        StreamPref.STATS_POSITION,
        StreamPref.STATS_QUICK_GLANCE_ENABLED,
        StreamPref.STATS_SHOW_WHEN_PLAYING,
        StreamPref.STATS_TEXT_SIZE,
        StreamPref.VIDEO_BRIGHTNESS,
        StreamPref.VIDEO_CONTRAST,
        StreamPref.VIDEO_MAX_FPS,
        StreamPref.VIDEO_PLAYER_TYPE,
        StreamPref.VIDEO_POSITION,
        StreamPref.VIDEO_POWER_PREFERENCE,
        StreamPref.VIDEO_PROCESSING,
        StreamPref.VIDEO_PROCESSING_MODE,
        StreamPref.VIDEO_RATIO,
        StreamPref.VIDEO_SATURATION,
        StreamPref.VIDEO_SHARPNESS,
    ],
} as const;

export type AnySettingsStorage = BaseSettingsStorage<GlobalPref> | BaseSettingsStorage<StreamPref>;
export type AnyPref = GlobalPref | StreamPref;

export type PrefTypeMap<Key> = Key extends GlobalPref
  ? GlobalPrefTypeMap
  : Key extends StreamPref
  ? StreamPrefTypeMap
  : never;
