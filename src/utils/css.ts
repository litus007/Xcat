import { CE } from "@utils/html";
import { compressCss, isLiteVersion, renderStylus } from "@macros/build" with { type: "macro" };
import { BlockFeature, UiSection, UiTheme } from "@/enums/pref-values";
import { GlobalPref } from "@/enums/pref-keys";
import { getGlobalPref } from "./pref-utils";
import { containsAll } from "./utils";


export function addCss() {
    const STYLUS_CSS = renderStylus() as unknown as string;
    let css = STYLUS_CSS;

    const PREF_HIDE_SECTIONS = getGlobalPref(GlobalPref.UI_HIDE_SECTIONS);
    const selectorToHide = [];

    if (isLiteVersion()) {
        // Hide Controller icon in Game tiles
        selectorToHide.push('div[role=img][class*=SupportedInputsBadge] svg:first-of-type');
        selectorToHide.push('div[role=img][class*=SupportedInputsBadge]:not(:has(:nth-child(2)))');
    }

    // Hide "News" section
    if (PREF_HIDE_SECTIONS.includes(UiSection.NEWS)) {
        selectorToHide.push('#BodyContent > div[class*=CarouselRow-module]');
    }

    // Hide BYOG section
    if (getGlobalPref(GlobalPref.UI_HIDE_SECTIONS).includes(UiSection.BOYG)) {
        selectorToHide.push('#BodyContent > div[class*=ShowcaseRow-module__container___]');
    }

    // Hide "All games" section
    if (PREF_HIDE_SECTIONS.includes(UiSection.ALL_GAMES)) {
        selectorToHide.push('#BodyContent div[class*=AllGamesRow-module__gridContainer]');
        selectorToHide.push('#BodyContent div[class*=AllGamesRow-module__rowHeader]');
    }

    // Hide "Most popular" section
    if (PREF_HIDE_SECTIONS.includes(UiSection.MOST_POPULAR)) {
        selectorToHide.push('#BodyContent div[class*=HomePage-module__bottomSpacing]:has(a[href="/play/gallery/popular"])');
    }

    // Hide "Play with touch" section
    if (PREF_HIDE_SECTIONS.includes(UiSection.TOUCH)) {
        selectorToHide.push('#BodyContent div[class*=HomePage-module__bottomSpacing]:has(a[href="/play/gallery/touch"])');
    }

    // Hide "Recently added" section
    if (PREF_HIDE_SECTIONS.includes(UiSection.RECENTLY_ADDED)) {
        selectorToHide.push('#BodyContent div[class*=HomePage-module__bottomSpacing]:has(a[href="/play/gallery/recently-added"])');
    }

    // Hide "Genres section"
    if (PREF_HIDE_SECTIONS.includes(UiSection.GENRES)) {
        selectorToHide.push('#BodyContent div[class*=HomePage-module__genresRow]');
    }

    // Hide "GamePassPromo"
    if (containsAll(PREF_HIDE_SECTIONS, [UiSection.RECENTLY_ADDED, UiSection.LEAVING_SOON, UiSection.GENRES, UiSection.ALL_GAMES])) {
        selectorToHide.push('#BodyContent div[class*=GamePassPromoSection-module__container]');
    }

   // Hide "Start a party" button in the Guide menu
    if (getGlobalPref(GlobalPref.BLOCK_FEATURES).includes(BlockFeature.FRIENDS)) {
        selectorToHide.push('#gamepass-dialog-root div[class^=AchievementsPreview-module__container] + button[class*=HomeLandingPage-module__button]');
    }

    if (selectorToHide) {
        css += selectorToHide.join(',') + '{ display: none; }';
    }

    // Change site's background
    if (getGlobalPref(GlobalPref.UI_THEME) === UiTheme.DARK_OLED) {
        css += compressCss(`
body[data-theme=dark] {
    --gds-containerSolidAppBackground: #000 !important;
}

div[aria-hidden=true][class^=BackgroundImageAbsoluteContainer][class*=ProductDetailPage-module__backgroundImageGradient]:after {
    background: radial-gradient(ellipse 100% 100% at 50% 0, #1515178c 0, #1a1b1ea6 32%, #000000 100%) !important;
}

a[href="/play/gallery/all-games"][class*=AllGamesRow-module__seeAllCloudGames] {
    background: none !important;
}
`);
    }

    // Reduce animations
    if (getGlobalPref(GlobalPref.UI_REDUCE_ANIMATIONS)) {
        css += compressCss(`
/*div[class*=GameCard-module__card],*/
div[class^=GameCard-module__gameTitleInnerWrapper],
div[class^=ScrollArrows-module],
div[class^=ContextMenu-module__][class*=Dropdown-module__dropdownWrapper] {
    animation: none !important;
    transition: none !important;
}
`);
    }

    // Hide the top-left dots icon while playing
    if (getGlobalPref(GlobalPref.UI_HIDE_SYSTEM_MENU_ICON)) {
        css += compressCss(`
#StreamHud div[class^=Grip-module__container] {
    visibility: hidden;
}

@media (hover: hover) {
    #StreamHud button[class^=GripHandle-module__container]:hover div[class^=Grip-module__container] {
        visibility: visible;
    }
}

#StreamHud button[class^=GripHandle-module__container][aria-expanded=true] div[class^=Grip-module__container] {
    visibility: visible;
}

#StreamHud button[class^=GripHandle-module__container][aria-expanded=false] {
    background-color: transparent !important;
}

#StreamHud div[class^=StreamHUD-module__buttonsContainer] {
    padding: 0px !important;
}
`);
    }

    css += compressCss(`
#game-stream div[class*=StreamMenu-module__menu] {
    min-width: 100vw !important;
}
`);

    // Simplify Stream's menu
    if (getGlobalPref(GlobalPref.UI_SIMPLIFY_STREAM_MENU)) {
        css += compressCss(`
#game-stream div[class*=Menu-module__scrollable] {
    --bxStreamMenuItemSize: 80px;
    --streamMenuItemSize: calc(var(--bxStreamMenuItemSize) + 40px) !important;
}

.bx-badges {
    top: calc(var(--streamMenuItemSize) - 20px);
}

body[data-media-type=tv] .bx-badges {
    top: calc(var(--streamMenuItemSize) - 10px) !important;
}

#game-stream button[class*=MenuItem-module__container] {
    min-width: auto !important;
    min-height: auto !important;
    width: var(--bxStreamMenuItemSize) !important;
    height: var(--bxStreamMenuItemSize) !important;
}

#game-stream div[class*=MenuItem-module__label] {
    display: none !important;
}

#game-stream svg[class*=MenuItem-module__icon] {
    width: 36px;
    height: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
}
`);
    } else {
        css += compressCss(`
body[data-media-type=tv] .bx-badges {
    top: calc(var(--streamMenuItemSize) + 30px);
}

body:not([data-media-type=tv]) .bx-badges {
    top: calc(var(--streamMenuItemSize) + 20px);
}

body:not([data-media-type=tv]) button[class*=MenuItem-module__container] {
    min-width: auto !important;
    width: 100px !important;
}

body:not([data-media-type=tv]) button[class*=MenuItem-module__container]:nth-child(n+2) {
    margin-left: 10px !important;
}

body:not([data-media-type=tv]) div[class*=MenuItem-module__label] {
    margin-left: 8px !important;
    margin-right: 8px !important;
}
`);
    }

    // Hide scrollbar
    if (getGlobalPref(GlobalPref.UI_SCROLLBAR_HIDE)) {
        css += compressCss(`
html {
    scrollbar-width: none;
}

body::-webkit-scrollbar {
    display: none;
}
`);
    }

    const $style = CE('style', false, css);
    document.documentElement.appendChild($style);
}


/**
 * La font PromptFont (icones de botons) no es descarrega de cap servidor extern.
 * Si en vols utilitzar una còpia pròpia, defineix la URL a PROMPTFONT_URL.
 */
export const PROMPTFONT_URL = '';

export function preloadFonts() {
    if (!PROMPTFONT_URL) {
        return;
    }

    const $link = CE('link', {
        rel: 'preload',
        href: PROMPTFONT_URL,
        as: 'font',
        type: 'font/otf',
        crossorigin: '',
    });

    document.querySelector('head')?.appendChild($link);
}
