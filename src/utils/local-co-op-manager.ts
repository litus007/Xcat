import { BxEventBus } from "./bx-event-bus";
import { LocalLists } from "./local-lists";

export class LocalCoOpManager {
    private static instance: LocalCoOpManager;
    public static getInstance = () => LocalCoOpManager.instance ?? (LocalCoOpManager.instance = new LocalCoOpManager());

    private supportedIds: Set<string>;

    constructor() {
        BxEventBus.Script.once('list.localCoOp.updated', e => {
            this.supportedIds = e.ids;
        });
        this.supportedIds = LocalLists.getLocalCoOpList();
    }

    isSupported(productId: string) {
        return this.supportedIds.has(productId);
    }
}
