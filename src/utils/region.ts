import { STATES } from "@utils/global";
import { GlobalPref } from "@/enums/pref-keys";
import { getGlobalPref } from "./pref-utils";


export function getPreferredServerRegion(shortName = false): string | null {
    let preferredRegion = getGlobalPref(GlobalPref.SERVER_REGION);
    const serverRegions = STATES.serverRegions;

    // Return preferred region
    if (preferredRegion in serverRegions) {
        if (shortName && serverRegions[preferredRegion].shortName) {
            return serverRegions[preferredRegion].shortName;
        } else {
            return preferredRegion;
        }
    }

    // Get default region
    for (let regionName in serverRegions) {
        const region = serverRegions[regionName];
        if (!region.isDefault) {
            continue;
        }

        if (shortName && region.shortName) {
            return region.shortName;
        } else {
            return regionName;
        }
    }

    return null;
}
