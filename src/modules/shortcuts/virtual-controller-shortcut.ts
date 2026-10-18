import { generateVirtualControllerMapping } from "@/utils/gamepad";

export class VirtualControllerShortcut {
    static pressXboxButton(): void {
        const streamSession = window.BX_EXPOSED.streamSession;
        if (!streamSession) {
            return;
        }

        const released = generateVirtualControllerMapping(0);
        const pressed = generateVirtualControllerMapping(0, {
            Nexus: 1,
            VirtualPhysicality: 1024, // Home
        });

        streamSession.onVirtualGamepadInput('systemMenu', performance.now(), [pressed]);
        setTimeout(() => {
            streamSession.onVirtualGamepadInput('systemMenu', performance.now(), [released]);
        }, 100);
    }
}
