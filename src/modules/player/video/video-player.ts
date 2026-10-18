import { CE } from "@/utils/html";
import { BaseStreamPlayer, StreamPlayerElement } from "../base-stream-player";
import { StreamPlayerType, StreamVideoProcessing } from "@/enums/pref-values";
import { GlobalPref } from "@/enums/pref-keys";
import { getGlobalPref } from "@/utils/pref-utils";
import { ScreenshotManager } from "@/utils/screenshot-manager";

export class VideoPlayer extends BaseStreamPlayer {
    private $videoCss!: HTMLStyleElement;
    private $usmMatrix!: SVGFEConvolveMatrixElement;

    constructor($video: HTMLVideoElement, logTag: string) {
        super(StreamPlayerType.VIDEO, StreamPlayerElement.VIDEO, $video, logTag);
    }

    init(): void {
        super.init();

        // Setup SVG filters
        const xmlns = 'http://www.w3.org/2000/svg';
        const $svg = CE('svg', {
                id: 'bx-video-filters',
                class: 'bx-gone',
                xmlns,
            },
            CE('defs', { xmlns: 'http://www.w3.org/2000/svg' },
                CE('filter', {
                    id: 'bx-filter-usm',
                    xmlns,
                }, this.$usmMatrix = CE('feConvolveMatrix', {
                    id: 'bx-filter-usm-matrix',
                    order: '3',
                    xmlns,
                }) as unknown as SVGFEConvolveMatrixElement),
            ),
        );

        this.$videoCss = CE('style', { id: 'bx-video-css' });

        const $fragment = document.createDocumentFragment();
        $fragment.append(this.$videoCss, $svg);
        document.documentElement.appendChild($fragment);
    }

    protected setupRendering(): void {}
    forceDrawFrame(): void {}
    updateCanvas(): void {}

    refreshPlayer() {
        let filters = this.getVideoPlayerFilterStyle();
        let videoCss = '';
        if (filters) {
            videoCss += `filter: ${filters} !important;`;
        }

        // Apply video filters to screenshots
        if (getGlobalPref(GlobalPref.SCREENSHOT_APPLY_FILTERS)) {
            ScreenshotManager.getInstance().updateCanvasFilters(filters);
        }

        let css = '';
        if (videoCss) {
            css = `#game-stream video { ${videoCss} }`;
        }

        this.$videoCss.textContent = css;
    }

    clearFilters() {
        this.$videoCss.textContent = '';
    }

    private getVideoPlayerFilterStyle() {
        const filters = [];

        const sharpness = this.options.sharpness || 0;
        if (this.options.processing === StreamVideoProcessing.USM && sharpness != 0) {
            const level = (7 - ((sharpness / 2) - 1) * 0.5).toFixed(1); // 5, 5.5, 6, 6.5, 7
            const matrix = `0 -1 0 -1 ${level} -1 0 -1 0`;
            this.$usmMatrix?.setAttributeNS(null, 'kernelMatrix', matrix);

            filters.push(`url(#bx-filter-usm)`);
        }

        const saturation = this.options.saturation || 100;
        if (saturation != 100) {
            filters.push(`saturate(${saturation}%)`);
        }

        const contrast =  this.options.contrast || 100;
        if (contrast != 100) {
            filters.push(`contrast(${contrast}%)`);
        }

        const brightness = this.options.brightness || 100;
        if (brightness != 100) {
            filters.push(`brightness(${brightness}%)`);
        }

        return filters.join(' ');
    }
}
