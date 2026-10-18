export abstract class MouseDataProvider {
    protected mkbHandler: MkbHandler;
    constructor(handler: MkbHandler) {
        this.mkbHandler = handler;
    }

    init() {};
    destroy() {};

    abstract start(): void;
    abstract stop(): void;
}

export abstract class MkbHandler {
    abstract init(): void;
    abstract start(): void;
    abstract stop(): void;
    abstract destroy(): void;
    abstract toggle(force: boolean): void;
    abstract handleMouseMove(data: MkbMouseMove): void;
    abstract handleMouseClick(data: MkbMouseClick): void;
    abstract handleMouseWheel(data: MkbMouseWheel): boolean;
    abstract waitForMouseData(enabled: boolean): void;
    abstract isEnabled(): boolean;
}
