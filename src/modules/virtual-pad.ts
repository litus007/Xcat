import { GlobalPref } from "@/enums/pref-keys";
import { BxEventBus } from "@utils/bx-event-bus";
import { CE } from "@utils/html";
import { getGlobalPref } from "@utils/pref-utils";
import { GamepadAdapter, XAxis, XKey } from "@modules/gamepad-adapter";

type ButtonDef = { key: XKey; label: string; cls: string };

const BUTTONS: ButtonDef[] = [
    { key: XKey.A, label: 'A', cls: 'a' },
    { key: XKey.B, label: 'B', cls: 'b' },
    { key: XKey.X, label: 'X', cls: 'x' },
    { key: XKey.Y, label: 'Y', cls: 'y' },
    { key: XKey.LB, label: 'LB', cls: 'lb' },
    { key: XKey.RB, label: 'RB', cls: 'rb' },
    { key: XKey.LT, label: 'LT', cls: 'lt' },
    { key: XKey.RT, label: 'RT', cls: 'rt' },
    { key: XKey.SELECT, label: '⧉', cls: 'select' },
    { key: XKey.START, label: '☰', cls: 'start' },
    { key: XKey.HOME, label: '⌂', cls: 'home' },
    { key: XKey.UP, label: '▲', cls: 'up' },
    { key: XKey.DOWN, label: '▼', cls: 'down' },
    { key: XKey.LEFT, label: '◀', cls: 'left' },
    { key: XKey.RIGHT, label: '▶', cls: 'right' },
];

/**
 * Mando digital en pantalla: un mando Xbox virtual per a pantalles tàctils.
 * Escriu l'estat a GamepadAdapter.virtual, que el fusiona amb (o substitueix) el mando físic.
 */
export class VirtualPad {
    private static instance: VirtualPad;
    public static getInstance = () => VirtualPad.instance ?? (VirtualPad.instance = new VirtualPad());

    private $root: HTMLElement | null = null;
    private haptics = true;
    private readonly adapter = GamepadAdapter.getInstance();

    /** Ha de cridar-se un cop a l'arrencada. */
    setup() {
        BxEventBus.Stream.on('state.playing', () => this.refresh());
        BxEventBus.Stream.on('state.stopped', () => this.hide());
    }

    private refresh() {
        if (!getGlobalPref(GlobalPref.VIRTUAL_PAD_ENABLED)) {
            this.hide();
            return;
        }

        this.haptics = !!getGlobalPref(GlobalPref.VIRTUAL_PAD_HAPTICS);
        this.hide();
        this.show();
    }

    private show() {
        const opacity = (getGlobalPref(GlobalPref.VIRTUAL_PAD_OPACITY) as number) / 100;
        const size = (getGlobalPref(GlobalPref.VIRTUAL_PAD_SIZE) as number) / 100;

        const $root = this.$root = CE('div', { class: 'bx-vpad' });
        $root.style.setProperty('--bx-vpad-opacity', String(opacity));
        $root.style.setProperty('--bx-vpad-scale', String(size));

        for (const def of BUTTONS) {
            $root.appendChild(this.createButton(def));
        }

        $root.appendChild(this.createStick('left', XAxis.LX, XAxis.LY, XKey.L3));
        $root.appendChild(this.createStick('right', XAxis.RX, XAxis.RY, XKey.R3));

        document.documentElement.appendChild($root);
        this.adapter.setVirtualActive(true);
    }

    private hide() {
        this.adapter.setVirtualActive(false);
        this.$root?.remove();
        this.$root = null;
    }

    private vibrate() {
        this.haptics && navigator.vibrate?.(8);
    }

    private createButton(def: ButtonDef): HTMLElement {
        const $btn = CE('div', { class: `bx-vpad-btn bx-vpad-${def.cls}` }, CE('span', false, def.label));
        const virtual = this.adapter.virtual;

        const press = (e: PointerEvent) => {
            e.preventDefault();
            $btn.setPointerCapture(e.pointerId);
            virtual.buttons[def.key] = 1;
            $btn.classList.add('bx-pressed');
            this.vibrate();
        };

        const release = (e: PointerEvent) => {
            virtual.buttons[def.key] = 0;
            $btn.classList.remove('bx-pressed');
        };

        $btn.addEventListener('pointerdown', press);
        $btn.addEventListener('pointerup', release);
        $btn.addEventListener('pointercancel', release);
        $btn.addEventListener('contextmenu', e => e.preventDefault());
        return $btn;
    }

    private createStick(side: 'left' | 'right', axisX: XAxis, axisY: XAxis, clickKey: XKey): HTMLElement {
        const $thumb = CE('div', { class: 'bx-vpad-thumb' });
        const $stick = CE('div', { class: `bx-vpad-stick bx-vpad-stick-${side}` }, $thumb);
        const virtual = this.adapter.virtual;

        let activeId = -1;
        let lastTap = 0;

        const update = (e: PointerEvent) => {
            const rect = $stick.getBoundingClientRect();
            const radius = rect.width / 2;
            let dx = (e.clientX - (rect.left + radius)) / radius;
            let dy = (e.clientY - (rect.top + radius)) / radius;
            const mag = Math.hypot(dx, dy);
            if (mag > 1) {
                dx /= mag;
                dy /= mag;
            }

            virtual.axes[axisX] = dx;
            virtual.axes[axisY] = dy;
            $thumb.style.transform = `translate(${dx * 50}%, ${dy * 50}%)`;
        };

        $stick.addEventListener('pointerdown', e => {
            if (activeId !== -1) {
                return;
            }

            e.preventDefault();
            activeId = e.pointerId;
            $stick.setPointerCapture(e.pointerId);

            // Doble toc = clic de la palanca (L3/R3)
            const now = performance.now();
            if (now - lastTap < 300) {
                virtual.buttons[clickKey] = 1;
                this.vibrate();
            }
            lastTap = now;

            update(e);
        });

        $stick.addEventListener('pointermove', e => {
            e.pointerId === activeId && update(e);
        });

        const end = (e: PointerEvent) => {
            if (e.pointerId !== activeId) {
                return;
            }

            activeId = -1;
            virtual.axes[axisX] = 0;
            virtual.axes[axisY] = 0;
            virtual.buttons[clickKey] = 0;
            $thumb.style.transform = '';
        };

        $stick.addEventListener('pointerup', end);
        $stick.addEventListener('pointercancel', end);
        $stick.addEventListener('contextmenu', e => e.preventDefault());
        return $stick;
    }
}
