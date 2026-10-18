import { StreamPref } from "@/enums/pref-keys";
import { limitVideoPlayerFps } from "../stream/stream-settings-utils";
import { BxEventBus } from "@/utils/bx-event-bus";
import { getStreamPref } from "@/utils/pref-utils";

export class RendererShortcut {
    static toggleVisibility() {
        const $mediaContainer = document.querySelector('#game-stream div[data-testid="media-container"]');
        if (!$mediaContainer) {
            BxEventBus.Stream.emit('video.visibility.changed', { isVisible: true });
            return;
        }

        $mediaContainer.classList.toggle('bx-gone');
        const isVisible = !$mediaContainer.classList.contains('bx-gone');

        // Switch FPS
        limitVideoPlayerFps(isVisible ? getStreamPref(StreamPref.VIDEO_MAX_FPS) : 0);
        BxEventBus.Stream.emit('video.visibility.changed', { isVisible });
    }
}
