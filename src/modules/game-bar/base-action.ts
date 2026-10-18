import { BxEventBus } from "@/utils/bx-event-bus";

export abstract class BaseGameBarAction {
    abstract $content: HTMLElement;

    constructor() {}
    reset() {}

    onClick(e: Event) {
        BxEventBus.Stream.emit('gameBar.activated', {});
    };

    render(): HTMLElement {
        return this.$content;
    };
}
