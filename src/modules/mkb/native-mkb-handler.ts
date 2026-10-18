import { Toast } from "@/utils/toast";
import { PointerClient } from "./pointer-client";
import { AppInterface, STATES } from "@/utils/global";
import { MkbHandler } from "./base-mkb-handler";
import { t } from "@/utils/translation";
import { BxEvent } from "@/utils/bx-event";
import { GlobalPref, StreamPref } from "@/enums/pref-keys";
import { BxLogger } from "@/utils/bx-logger";
import { MkbPopup } from "./mkb-popup";
import { KeyHelper } from "./key-helper";
import { StreamSettings } from "@/utils/stream-settings";
import { ShortcutAction } from "@/enums/shortcut-actions";
import { NativeMkbMode } from "@/enums/pref-values";
import { BxEventBus } from "@/utils/bx-event-bus";
import { getStreamPref, getGlobalPref } from "@/utils/pref-utils";

export class NativeMkbHandler extends MkbHandler {
    private static instance: NativeMkbHandler | null | undefined;
    public static getInstance(): typeof NativeMkbHandler['instance'] {
        if (typeof NativeMkbHandler.instance === 'undefined') {
            if (NativeMkbHandler.isAllowed()) {
                NativeMkbHandler.instance = new NativeMkbHandler();
            } else {
                NativeMkbHandler.instance = null;
            }
        }

        return NativeMkbHandler.instance;
    }
    private readonly LOG_TAG = 'NativeMkbHandler';

    static isAllowed = () => {
        return STATES.browser.capabilities.emulatedNativeMkb && getGlobalPref(GlobalPref.NATIVE_MKB_MODE) === NativeMkbMode.ON;
    }

    private pointerClient: PointerClient | undefined;
    private enabled = false;

    private mouseButtonsPressed = 0;

    private mouseVerticalMultiply = 0;
    private mouseHorizontalMultiply = 0;

    private inputChannel: XcloudInputChannel | undefined;

    private popup!: MkbPopup;

    private constructor() {
        super();
        BxLogger.info(this.LOG_TAG, 'constructor()');

        this.popup = MkbPopup.getInstance();
        this.popup.attachMkbHandler(this);
    }

    private onKeyboardEvent(e: KeyboardEvent) {
        if (e.type === 'keyup' && e.code === 'F8') {
            e.preventDefault();
            this.toggle();
            return;
        }
    }

    private onPointerLockRequested(e: Event) {
        AppInterface.requestPointerCapture();
        this.start();
    }

    private onPointerLockExited(e: Event) {
        AppInterface.releasePointerCapture();
        this.stop();
    }

    private onPollingModeChanged = (e: Event) => {
        const move = window.BX_STREAM_SETTINGS.xCloudPollingMode !== 'none';
        this.popup.moveOffscreen(move);
    }

    private onDialogShown = () => {
        document.pointerLockElement && document.exitPointerLock();
    }

    handleEvent(event: Event) {
        switch (event.type) {
            case 'keyup':
                this.onKeyboardEvent(event as KeyboardEvent);
                break;

            case BxEvent.POINTER_LOCK_REQUESTED:
                this.onPointerLockRequested(event);
                break;
            case BxEvent.POINTER_LOCK_EXITED:
                this.onPointerLockExited(event);
                break;

            case BxEvent.XCLOUD_POLLING_MODE_CHANGED:
                this.onPollingModeChanged(event);
                break;
        }
    }

    init() {
        this.pointerClient = PointerClient.getInstance();
        this.inputChannel = window.BX_EXPOSED.inputChannel;

        // Stop keyboard input at startup
        this.updateInputConfigurationAsync(false);

        try {
            this.pointerClient.start(STATES.pointerServerPort, this);
        } catch (e) {
            Toast.show(t('mkb-cannot-enable'));
        }

        this.mouseVerticalMultiply = getStreamPref(StreamPref.NATIVE_MKB_SCROLL_VERTICAL_SENSITIVITY);
        this.mouseHorizontalMultiply = getStreamPref(StreamPref.NATIVE_MKB_SCROLL_HORIZONTAL_SENSITIVITY);

        window.addEventListener('keyup', this);

        window.addEventListener(BxEvent.POINTER_LOCK_REQUESTED, this);
        window.addEventListener(BxEvent.POINTER_LOCK_EXITED, this);
        window.addEventListener(BxEvent.XCLOUD_POLLING_MODE_CHANGED, this);
        BxEventBus.Script.on('dialog.shown', this.onDialogShown);

        const shortcutKey = StreamSettings.findKeyboardShortcut(ShortcutAction.MKB_TOGGLE);
        if (shortcutKey) {
            const msg = t('press-key-to-toggle-mkb', { key: `<b>${KeyHelper.codeToKeyName(shortcutKey)}</b>` });
            Toast.show(msg, t('native-mkb'), { html: true });
        }

        this.waitForMouseData(false);
    }

    toggle(force?: boolean) {
        let setEnable: boolean;
        if (typeof force !== 'undefined') {
            setEnable = force;
        } else {
            setEnable = !this.enabled;
        }

        if (setEnable) {
            document.documentElement.requestPointerLock();
        } else {
            document.exitPointerLock();
        }
    }

    private updateInputConfigurationAsync(enabled: boolean) {
        window.BX_EXPOSED.streamSession.updateInputConfigurationAsync({
            enableKeyboardInput: enabled,
            enableMouseInput: enabled,
            enableAbsoluteMouse: false,
            enableTouchInput: false,
        });
    }

    start() {
        this.resetMouseInput();
        this.enabled = true;

        this.updateInputConfigurationAsync(true);

        window.BX_EXPOSED.stopTakRendering = true;
        this.waitForMouseData(false);

        Toast.show(t('native-mkb'), t('enabled'), { instant: true });
    }

    stop() {
        this.resetMouseInput();
        this.enabled = false;
        this.updateInputConfigurationAsync(false);

        this.waitForMouseData(true);
    }

    destroy(): void {
        this.pointerClient?.stop();
        this.stop();

        window.removeEventListener('keyup', this);

        window.removeEventListener(BxEvent.POINTER_LOCK_REQUESTED, this);
        window.removeEventListener(BxEvent.POINTER_LOCK_EXITED, this);
        window.removeEventListener(BxEvent.XCLOUD_POLLING_MODE_CHANGED, this);
        BxEventBus.Script.off('dialog.shown', this.onDialogShown);

        this.waitForMouseData(false);
        document.exitPointerLock();
    }

    handleMouseMove(data: MkbMouseMove): void {
        this.sendMouseInput({
            X: data.movementX,
            Y: data.movementY,
            Buttons: this.mouseButtonsPressed,
            WheelX: 0,
            WheelY: 0,
        });
    }

    handleMouseClick(data: MkbMouseClick): void {
        const { pointerButton, pressed } = data;

        if (pressed) {
            this.mouseButtonsPressed |= pointerButton!;
        } else {
            this.mouseButtonsPressed ^= pointerButton!;
        }
        this.mouseButtonsPressed = Math.max(0, this.mouseButtonsPressed);

        this.sendMouseInput({
            X: 0,
            Y: 0,
            Buttons: this.mouseButtonsPressed,
            WheelX: 0,
            WheelY: 0,
        });
    }

    handleMouseWheel(data: MkbMouseWheel): boolean {
        const { vertical, horizontal } = data;

        let mouseWheelX = horizontal;
        if (this.mouseHorizontalMultiply && this.mouseHorizontalMultiply !== 1) {
            mouseWheelX *= this.mouseHorizontalMultiply;
        }

        let mouseWheelY = vertical;
        if (this.mouseVerticalMultiply && this.mouseVerticalMultiply !== 1) {
            mouseWheelY *= this.mouseVerticalMultiply;
        }

        this.sendMouseInput({
            X: 0,
            Y: 0,
            Buttons: this.mouseButtonsPressed,
            WheelX: mouseWheelX,
            WheelY: mouseWheelY,
        });

        return true;
    }

    setVerticalScrollMultiplier(vertical: number) {
        this.mouseVerticalMultiply = vertical;
    }

    setHorizontalScrollMultiplier(horizontal: number) {
        this.mouseHorizontalMultiply = horizontal;
    }

    waitForMouseData(showPopup: boolean) {
        this.popup.toggleVisibility(showPopup);
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    private sendMouseInput(data: NativeMouseData) {
        data.Type = 0;  // Relative
        this.inputChannel?.queueMouseInput(data);
    }

    private resetMouseInput() {
        this.mouseButtonsPressed = 0;

        this.sendMouseInput({
            X: 0,
            Y: 0,
            Buttons: 0,
            WheelX: 0,
            WheelY: 0,
        });
    }
}
