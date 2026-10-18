import { GlobalPref } from "@/enums/pref-keys";
import { BX_FLAGS } from "./bx-flags";
import { BlockFeature, NativeMkbMode } from "@/enums/pref-values";
import { getGlobalPref } from "./pref-utils";

export let FeatureGates: { [key: string]: boolean } = {
    PwaPrompt: false,
    EnableWifiWarnings: false,
    EnableUpdateRequiredPage: false,
    ShowForcedUpdateScreen: false,
    EnableTakControlResizing: true,  // Experimenting
    EnableLazyLoadedHome: false,
    EnableRemotePlay: !getGlobalPref(GlobalPref.BLOCK_FEATURES).includes(BlockFeature.REMOTE_PLAY),
    EnableConsoles: !getGlobalPref(GlobalPref.BLOCK_FEATURES).includes(BlockFeature.REMOTE_PLAY),
};

// Enable Native Mouse & Keyboard
const nativeMkbMode = getGlobalPref(GlobalPref.NATIVE_MKB_MODE);
if (nativeMkbMode !== NativeMkbMode.DEFAULT) {
    FeatureGates.EnableMouseAndKeyboard = nativeMkbMode === NativeMkbMode.ON;
}

// Disable chat feature
const blockFeatures = getGlobalPref(GlobalPref.BLOCK_FEATURES);
if (blockFeatures.includes(BlockFeature.CHAT)) {
    FeatureGates.EnableGuideChatTab = false;
}

if (blockFeatures.includes(BlockFeature.FRIENDS)) {
    FeatureGates.EnableFriendsAndFollowers = false;
}

if (BX_FLAGS.FeatureGates) {
    FeatureGates = Object.assign(BX_FLAGS.FeatureGates, FeatureGates);
}
