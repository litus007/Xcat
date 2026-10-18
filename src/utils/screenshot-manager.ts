import { AppInterface, STATES } from "./global";
import { CE } from "./html";
import { GlobalPref } from "@/enums/pref-keys";
import { BxLogger } from "./bx-logger";
import { getGlobalPref } from "@/utils/pref-utils";
import { StreamPlayerElement } from "@/modules/player/base-stream-player";


export class ScreenshotManager {
    private static instance: ScreenshotManager;
    public static getInstance = () => ScreenshotManager.instance ?? (ScreenshotManager.instance = new ScreenshotManager());
    private readonly LOG_TAG = 'ScreenshotManager';

    private $download: HTMLAnchorElement;
    private $canvas: HTMLCanvasElement;
    private canvasContext: CanvasRenderingContext2D;

    private constructor() {
        BxLogger.info(this.LOG_TAG, 'constructor()');

        this.$download = CE('a');

        this.$canvas = CE('canvas', { class: 'bx-gone' });
        this.canvasContext = this.$canvas.getContext('2d', {
            alpha: false,
            willReadFrequently: false,
        })!;
    }

    updateCanvasSize(width: number, height: number) {
        this.$canvas.width = width;
        this.$canvas.height = height;
    }

    updateCanvasFilters(filters: string) {
        this.canvasContext.filter = filters;
    }

    private onAnimationEnd(e: Event) {
        (e.target as HTMLElement).classList.remove('bx-taking-screenshot');
    }

    takeScreenshot(callback?: any) {
        const currentStream = STATES.currentStream;
        const streamPlayerManager = currentStream.streamPlayerManager;
        const $canvas = this.$canvas;
        if (!streamPlayerManager || !$canvas) {
            return;
        }

        let $player;
        if (getGlobalPref(GlobalPref.SCREENSHOT_APPLY_FILTERS)) {
            $player = streamPlayerManager.getPlayerElement();
        } else {
            $player = streamPlayerManager.getPlayerElement(StreamPlayerElement.VIDEO);
        }

        if (!$player || !$player.isConnected) {
            return;
        }

        const canvasContext = this.canvasContext;
        if ($player instanceof HTMLCanvasElement) {
            streamPlayerManager.getCanvasPlayer()?.updateFrame();
        }
        canvasContext.drawImage($player, 0, 0);

        // Play animation
        const $gameStream = $player.closest('#game-stream');
        if ($gameStream) {
            $gameStream.addEventListener('animationend', this.onAnimationEnd, { once: true });
            $gameStream.classList.add('bx-taking-screenshot');
        }

        // Get data URL and pass to parent app
        if (AppInterface) {
            const data = $canvas.toDataURL('image/png').split(';base64,')[1];
            AppInterface.saveScreenshot(currentStream.titleSlug, data);

            // Free screenshot from memory
            canvasContext.clearRect(0, 0, $canvas.width, $canvas.height);

            callback && callback();
            return;
        }

        $canvas.toBlob(blob => {
            if (!blob) {
                return;
            }

            // Download screenshot
            const now = +new Date;
            const $download = this.$download;
            $download.download = `${currentStream.titleSlug}-${now}.png`;
            $download.href = URL.createObjectURL(blob);
            $download.click();

            // Free screenshot from memory
            URL.revokeObjectURL($download.href);
            $download.href = '';
            $download.download = '';
            canvasContext.clearRect(0, 0, $canvas.width, $canvas.height);

            callback && callback();
        }, 'image/png');
    }
}
