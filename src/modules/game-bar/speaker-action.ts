import { BxIcon } from "@utils/bx-icon";
import { createButton, ButtonStyle, CE } from "@utils/html";
import { BaseGameBarAction } from "./base-action";
import { SoundShortcut, SpeakerState } from "../shortcuts/sound-shortcut";
import { BxEventBus } from "@/utils/bx-event-bus";


export class SpeakerAction extends BaseGameBarAction {
    $content: HTMLElement;

    constructor() {
        super();

        const $btnEnable = createButton({
            style: ButtonStyle.GHOST,
            icon: BxIcon.AUDIO,
            onClick: this.onClick,
        });

        const $btnMuted = createButton({
            style: ButtonStyle.GHOST,
            icon: BxIcon.SPEAKER_MUTED,
            onClick: this.onClick,
            classes: ['bx-activated'],
        });

        this.$content = CE('div', false, $btnEnable, $btnMuted);

        BxEventBus.Stream.on('speaker.state.changed', payload => {
            const enabled = payload.state === SpeakerState.ENABLED;
            this.$content.dataset.activated = (!enabled).toString();
        });
    }

    onClick = (e: Event) => {
        super.onClick(e);
        SoundShortcut.muteUnmute();
    }

    reset(): void {
        this.$content.dataset.activated = 'false';
    }
}
