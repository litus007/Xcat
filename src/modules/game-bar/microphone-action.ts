import { BxIcon } from "@utils/bx-icon";
import { createButton, ButtonStyle, CE } from "@utils/html";
import { BaseGameBarAction } from "./base-action";
import { MicrophoneShortcut, MicrophoneState } from "../shortcuts/microphone-shortcut";
import { BxEventBus } from "@/utils/bx-event-bus";


export class MicrophoneAction extends BaseGameBarAction {
    $content: HTMLElement;

    constructor() {
        super();

        const $btnDefault = createButton({
            style: ButtonStyle.GHOST,
            icon: BxIcon.MICROPHONE,
            onClick: this.onClick,
            classes: ['bx-activated'],
        });

        const $btnMuted = createButton({
            style: ButtonStyle.GHOST,
            icon: BxIcon.MICROPHONE_MUTED,
            onClick: this.onClick,
        });

        this.$content = CE('div', false, $btnMuted, $btnDefault);

        BxEventBus.Stream.on('microphone.state.changed', payload => {
            const enabled = payload.state === MicrophoneState.ENABLED;
            this.$content.dataset.activated = enabled.toString();

            // Show the button in Game Bar if the mic is enabled
            this.$content.classList.remove('bx-gone');
        });
    }

    onClick = (e: Event) => {
        super.onClick(e);
        const enabled = MicrophoneShortcut.toggle(false);
        this.$content.dataset.activated = enabled.toString();
    }

    reset(): void {
        this.$content.classList.add('bx-gone');
        this.$content.dataset.activated = 'false';
    }
}
