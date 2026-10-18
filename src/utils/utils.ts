import { AppInterface } from "@utils/global";
import { UserAgent } from "@utils/user-agent";
import { t } from "./translation";
import { Toast } from "./toast";
import { GlobalPref } from "@/enums/pref-keys";
import { LocalDb } from "./local-db/local-db";
import { BlockFeature } from "@/enums/pref-values";
import { getGlobalPref } from "@/utils/pref-utils";

/**
 * Disable PWA requirement on Safari
 */
export function disablePwa() {
    const userAgent = (window.navigator.orgUserAgent || window.navigator.userAgent || '').toLowerCase();
    if (!userAgent) {
        return;
    }

    // Check if it's Safari on mobile
    if (!!AppInterface || UserAgent.isSafariMobile()) {
        // Disable the PWA prompt
        Object.defineProperty(window.navigator, 'standalone', {
            value: true,
        });
    }
}


/**
 * Calculate hash code from a string
 * @see http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
 */
export function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0, len = str.length; i < len; i++) {
        const chr = str.charCodeAt(i);
        hash = (hash << 5) - hash + chr;
        hash |= 0; // Convert to 32-bit integer
    }

    return hash;
}


export function renderString(str: string, obj: any){
    // Accept ${var} and $var$
    return str.replace(/\$\{([A-Za-z0-9_$]+)\}|\$([A-Za-z0-9_$]+)\$/g, (match, p1, p2) => {
        const name = p1 || p2;
        return name in obj ? obj[name] : match;
    });
}


export function ceilToNearest(value: number, interval: number): number {
    return Math.ceil(value / interval) * interval;
}

export function floorToNearest(value: number, interval: number): number {
    return Math.floor(value / interval) * interval;
}

export function roundToNearest(value: number, interval: number): number {
    return Math.round(value / interval) * interval;
}

export async function copyToClipboard(text: string, showToast=true): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        showToast && Toast.show(t('copied-to-clipboard'), '', { instant: true });
        return true;
    } catch (err) {
        console.error('Failed to copy: ', err);
        showToast && Toast.show(t('copy-failed'), '', { instant: true });
    }

    return false;
}

export function productTitleToSlug(title: string): string {
    return title.replace(/[;,/?:@&=+_`~$%#^*()!^\u2122\xae\xa9]/g, '')
            .replace(/\|/g, '-')
            .replace(/ {2,}/g, ' ')
            .trim()
            .substr(0, 50)
            .replace(/ /g, '-')
            .toLowerCase();
}

export function parseDetailsPath(path: string) {
    const matches = /\/games\/(?<titleSlug>[^\/]+)\/(?<productId>\w+)/.exec(path);
    if (!matches?.groups) {
        return {};
    }

    const titleSlug = matches.groups.titleSlug!.replaceAll('\%' + '7C', '-');
    const productId = matches.groups.productId;

    return { titleSlug, productId };
}

export function clearAllData() {
    // Delete localStorage items

    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key) {
            continue;
        }

        // Delete key
        if (key.startsWith('BetterXcloud') || key.startsWith('better_xcloud')) {
            localStorage.removeItem(key);
        }
    }

    // Delete IndexedDB database
    try {
        indexedDB.deleteDatabase(LocalDb.DB_NAME);
    } catch (e) {};

    alert(t('clear-data-success'));
}

export function containsAll(arr: Array<any>, values: Array<any>) {
    return values.every(val => arr.includes(val));
}

export function blockAllNotifications() {
    const blockFeatures = getGlobalPref(GlobalPref.BLOCK_FEATURES);
    const blockAll = containsAll(blockFeatures, [BlockFeature.FRIENDS, BlockFeature.NOTIFICATIONS_ACHIEVEMENTS, BlockFeature.NOTIFICATIONS_INVITES]);
    return blockAll;
}

export function blockSomeNotifications() {
    const blockFeatures = getGlobalPref(GlobalPref.BLOCK_FEATURES);
    if (blockAllNotifications()) {
        return false;
    }

    const blockSome = [BlockFeature.FRIENDS, BlockFeature.NOTIFICATIONS_ACHIEVEMENTS, BlockFeature.NOTIFICATIONS_INVITES].some(value => blockFeatures.includes(value));
    return blockSome;
}

export function isPlainObject(input: any) {
    return (
        typeof input === 'object' &&
        input !== null &&
        input.constructor === Object
    );
}
