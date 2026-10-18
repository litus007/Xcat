import { BxIcon } from "@utils/bx-icon";
import { createButton, ButtonStyle, CE } from "@utils/html";
import { BaseGameBarAction } from "./base-action";
import { RendererShortcut } from "../shortcuts/renderer-shortcut";
import { BxEventBus } from "@/utils/bx-event-bus";


export class RendererAction extends BaseGameBarAction {
    $content: HTMLElement;

    constructor() {
        super();

        const $btnDefault = createButton({
            style: ButtonStyle.GHOST,
            icon: BxIcon.EYE,
            onClick: this.onClick,
        });

        const $btnActivated = createButton({
            style: ButtonStyle.GHOST,
            icon: BxIcon.EYE_SLASH,
            onClick: this.onClick,
            classes: ['bx-activated'],
        });

        this.$content = CE('div', false, $btnDefault, $btnActivated);

        BxEventBus.Stream.on('video.visibility.changed', payload => {
            this.$content.dataset.activated = (!payload.isVisible).toString();
        });
    }

    onClick = (e: Event) => {
        super.onClick(e);
        RendererShortcut.toggleVisibility();
    }

    reset(): void {
        this.$content.dataset.activated = 'false';
    }
}
