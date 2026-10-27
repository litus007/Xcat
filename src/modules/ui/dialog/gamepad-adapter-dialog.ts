import { ButtonStyle, CE, createButton } from "@utils/html";
import { t } from "@utils/translation";
import { Toast } from "@utils/toast";
import { GamepadAdapter, XAxis, XKey, cloneProfile, getPhysicalInfo, identityProfile, type AdapterProfile, type SourceRef } from "@modules/gamepad-adapter";

type Step =
    | { kind: 'button'; key: XKey; label: string }
    | { kind: 'axis'; axis: XAxis; label: string };

const STEPS: Step[] = [
    { kind: 'button', key: XKey.A, label: 'A' },
    { kind: 'button', key: XKey.B, label: 'B' },
    { kind: 'button', key: XKey.X, label: 'X' },
    { kind: 'button', key: XKey.Y, label: 'Y' },
    { kind: 'button', key: XKey.LB, label: 'LB' },
    { kind: 'button', key: XKey.RB, label: 'RB' },
    { kind: 'button', key: XKey.LT, label: 'LT' },
    { kind: 'button', key: XKey.RT, label: 'RT' },
    { kind: 'button', key: XKey.SELECT, label: 'Select / View' },
    { kind: 'button', key: XKey.START, label: 'Start / Menu' },
    { kind: 'button', key: XKey.UP, label: '↑' },
    { kind: 'button', key: XKey.DOWN, label: '↓' },
    { kind: 'button', key: XKey.LEFT, label: '←' },
    { kind: 'button', key: XKey.RIGHT, label: '→' },
    { kind: 'button', key: XKey.L3, label: 'L3' },
    { kind: 'button', key: XKey.R3, label: 'R3' },
    { kind: 'button', key: XKey.HOME, label: 'Xbox / Home' },
    { kind: 'axis', axis: XAxis.LX, label: `${t('left-stick')} →` },
    { kind: 'axis', axis: XAxis.LY, label: `${t('left-stick')} ↓` },
    { kind: 'axis', axis: XAxis.RX, label: `${t('right-stick')} →` },
    { kind: 'axis', axis: XAxis.RY, label: `${t('right-stick')} ↓` },
];

const DPAD_DIR: { [key: number]: 'u' | 'r' | 'd' | 'l' } = {
    [XKey.UP]: 'u',
    [XKey.RIGHT]: 'r',
    [XKey.DOWN]: 'd',
    [XKey.LEFT]: 'l',
};

const HAT_NEUTRAL_MIN = 1.1;

/**
 * Assistent d'assignació: l'usuari prem cada botó del seu mando i es desa un perfil
 * que tradueix el mando a un layout estàndard Xbox.
 */
export class GamepadAdapterDialog {
    private static current: GamepadAdapterDialog | null = null;

    static show() {
        if (GamepadAdapterDialog.current) {
            return;
        }

        const adapter = GamepadAdapter.getInstance();
        const gamepads = adapter.getPhysicalGamepads();
        if (!gamepads.length) {
            Toast.show(t('gamepad-adapter-no-gamepad'), '🎮', { instant: true });
            return;
        }

        // Amb espectadors connectats, l'assistent aïlla els mandos remots (vegeu isLearning).
        // Avise'm perquè l'usuari sàpiga que el multijugador queda en pausa mentre mapeja.
        if (adapter.remoteCount() > 0) {
            Toast.show(t('gamepad-adapter-learning-pause-remotes'), '🎮', { instant: true });
        }

        GamepadAdapterDialog.current = new GamepadAdapterDialog(gamepads[0]!.index);
    }

    private readonly adapter = GamepadAdapter.getInstance();
    private readonly profile: AdapterProfile = cloneProfile(identityProfile());

    private $overlay: HTMLElement;
    private $dialog: HTMLElement;
    private $prompt!: HTMLElement;
    private $input!: HTMLElement;
    private $bar!: HTMLElement;

    private stepIndex = 0;
    private rafId = 0;
    private armedAt = 0;
    private physicalKey: string;
    private baseline: { buttons: number[]; axes: number[] } | null = null;
    private gamepadIndex: number;

    private constructor(gamepadIndex: number) {
        this.gamepadIndex = gamepadIndex;

        const gp = this.getGamepad()!;
        const info = getPhysicalInfo(gp);
        this.physicalKey = info.key;

        // Perfil net: totes les assignacions es llegeixen del mando real
        for (const k in this.profile.buttons) this.profile.buttons[k] = null;
        for (const k in this.profile.axes) this.profile.axes[k] = null;

        this.adapter.setLearning(this.physicalKey, true);

        this.$overlay = CE('div', { class: 'bx-gamepad-wizard-overlay' });
        this.$dialog = this.render(info.name);

        document.documentElement.appendChild(this.$overlay);
        document.documentElement.appendChild(this.$dialog);

        this.armStep();
        this.rafId = requestAnimationFrame(this.tick);
    }

    private getGamepad(): Gamepad | null {
        return this.adapter.getPhysicalGamepads().find(gp => gp.index === this.gamepadIndex) || null;
    }

    private render(name: string): HTMLElement {
        return CE('div', { class: 'bx-gamepad-wizard' },
            CE('h2', false, t('gamepad-adapter-learn')),
            CE('div', { class: 'bx-gamepad-wizard-name' }, name),
            this.$bar = CE('div', { class: 'bx-gamepad-wizard-progress' }, CE('div')),
            this.$prompt = CE('div', { class: 'bx-gamepad-wizard-prompt' }),
            CE('div', { class: 'bx-gamepad-wizard-hint' }, t('gamepad-adapter-learn-hint')),
            this.$input = CE('div', { class: 'bx-gamepad-wizard-input' }),
            CE('div', { class: 'bx-gamepad-wizard-buttons' },
                createButton({
                    label: t('gamepad-adapter-skip'),
                    style: ButtonStyle.FOCUSABLE,
                    onClick: () => this.next(),
                }),
                createButton({
                    label: t('gamepad-adapter-finish'),
                    style: ButtonStyle.PRIMARY | ButtonStyle.FOCUSABLE,
                    onClick: () => this.finish(),
                }),
                createButton({
                    label: t('cancel'),
                    style: ButtonStyle.DANGER | ButtonStyle.FOCUSABLE,
                    onClick: () => this.close(),
                }),
            ),
        );
    }

    /** Captura l'estat de repòs perquè només es detectin canvis nous. */
    private armStep() {
        const step = STEPS[this.stepIndex]!;
        this.$prompt.textContent = t('gamepad-adapter-press', { button: step.label });
        this.$bar.firstElementChild!.setAttribute('style', `width:${(this.stepIndex / STEPS.length) * 100}%`);
        this.$input.textContent = '';
        this.baseline = null;
        this.armedAt = performance.now() + 450; // evita detectar el botó anterior encara premut
    }

    private next() {
        this.stepIndex++;
        if (this.stepIndex >= STEPS.length) {
            this.finish();
            return;
        }

        this.armStep();
    }

    private tick = () => {
        this.rafId = requestAnimationFrame(this.tick);

        const gp = this.getGamepad();
        if (!gp || performance.now() < this.armedAt) {
            return;
        }

        if (!this.baseline) {
            this.baseline = {
                buttons: gp.buttons.map(b => b.value || (b.pressed ? 1 : 0)),
                axes: Array.from(gp.axes),
            };
            return;
        }

        const step = STEPS[this.stepIndex]!;
        const source = this.detect(gp, step);
        if (!source) {
            return;
        }

        if (step.kind === 'button') {
            this.profile.buttons[step.key] = source;
        } else {
            this.profile.axes[step.axis] = source;
        }

        this.$input.textContent = `✔ ${t('gamepad-adapter-input-detected')}`;
        this.armedAt = performance.now() + 500;
        window.setTimeout(() => this.next(), 250);
    };

    private detect(gp: Gamepad, step: Step): SourceRef | null {
        const base = this.baseline!;

        // 1) Botons
        for (let i = 0; i < gp.buttons.length; i++) {
            const value = gp.buttons[i]!.value || (gp.buttons[i]!.pressed ? 1 : 0);
            if (value > 0.6 && (base.buttons[i] ?? 0) < 0.4) {
                if (step.kind === 'button') {
                    return { t: 'b', i };
                }
                // Per a palanques, un botó no serveix
                return null;
            }
        }

        // 2) Eixos
        for (let i = 0; i < gp.axes.length; i++) {
            const v = gp.axes[i]!;
            const b = base.axes[i] ?? 0;

            // D-pad codificat en un eix "hat" (repòs ≈ 1.29)
            if (b > HAT_NEUTRAL_MIN && Math.abs(v - b) > 0.3 && step.kind === 'button' && step.key in DPAD_DIR) {
                return { t: 'h', i, d: DPAD_DIR[step.key]! };
            }

            if (Math.abs(v - b) < 0.6 || b > HAT_NEUTRAL_MIN) {
                continue;
            }

            if (step.kind === 'axis') {
                // Es demana empènyer cap a la dreta / cap avall
                return { t: 'f', i, inv: v < b };
            }

            // Gallet analògic en un eix: repòs a -1 (rang -1..1) o repòs a 0
            if (b <= -0.9 && v > b) {
                return { t: 'tr', i };
            }

            return { t: 'a', i, d: v > b ? 1 : -1 };
        }

        return null;
    }

    private finish() {
        // Els passos omesos queden amb el valor per defecte (cap botó)
        this.adapter.setProfile(this.physicalKey, this.profile);
        Toast.show(t('gamepad-adapter-saved'), '✅', { instant: true });
        this.close();
    }

    private close() {
        cancelAnimationFrame(this.rafId);
        this.adapter.setLearning(this.physicalKey, false);
        this.$overlay.remove();
        this.$dialog.remove();
        GamepadAdapterDialog.current = null;
    }
}
