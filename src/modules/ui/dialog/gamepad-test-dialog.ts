import { ButtonStyle, CE, createButton } from "@utils/html";
import { t } from "@utils/translation";
import { Toast } from "@utils/toast";
import { GamepadAdapter } from "@modules/gamepad-adapter";

const DURATION_MS = 5000;

/**
 * Prova de freqüència del mando: mesura cada quant arriba un informe nou del mando al navegador.
 * No mesura la latència total fins a la consola (això no es pot fer des del navegador), però sí el
 * tram mando → dispositiu, que és on es noten les diferències entre Bluetooth, cable i adaptadors.
 */
export class GamepadTestDialog {
    private static open = false;

    static show() {
        const adapter = GamepadAdapter.getInstance();
        const gamepads = adapter.getPhysicalGamepads();
        if (!gamepads.length || GamepadTestDialog.open) {
            !gamepads.length && Toast.show(t('gamepad-adapter-no-gamepad'), '🎮', { instant: true });
            return;
        }

        GamepadTestDialog.open = true;
        new GamepadTestDialog(adapter, gamepads[0]!.index);
    }

    private $overlay: HTMLElement;
    private $dialog: HTMLElement;
    private $prompt!: HTMLElement;
    private $result!: HTMLElement;
    private $bar!: HTMLElement;

    private running = true;
    private channel = new MessageChannel();
    private start = performance.now();
    private lastTimestamp = -1;
    private intervals: number[] = [];
    private lastChange = 0;

    private constructor(private adapter: GamepadAdapter, private index: number) {
        this.$overlay = CE('div', { class: 'bx-gamepad-wizard-overlay' });
        this.$dialog = CE('div', { class: 'bx-gamepad-wizard' },
            CE('h2', false, t('pad-test-title')),
            this.$bar = CE('div', { class: 'bx-gamepad-wizard-progress' }, CE('div')),
            this.$prompt = CE('div', { class: 'bx-gamepad-wizard-prompt' }, t('pad-test-hint')),
            this.$result = CE('div', { class: 'bx-gamepad-wizard-input' }),
            CE('div', { class: 'bx-gamepad-wizard-buttons' },
                createButton({
                    label: t('close'),
                    style: ButtonStyle.DANGER | ButtonStyle.FOCUSABLE,
                    onClick: () => this.close(),
                }),
            ),
        );

        document.documentElement.appendChild(this.$overlay);
        document.documentElement.appendChild(this.$dialog);

        // Bucle ràpid (MessageChannel): requestAnimationFrame només arriba a la freqüència de la pantalla
        this.channel.port1.onmessage = this.sample;
        this.channel.port2.postMessage(0);
    }

    private sample = () => {
        if (!this.running) {
            return;
        }

        const now = performance.now();
        const elapsed = now - this.start;
        const gp = this.adapter.getPhysicalGamepads().find(g => g.index === this.index);

        if (gp) {
            if (this.lastTimestamp >= 0 && gp.timestamp !== this.lastTimestamp) {
                this.intervals.push(gp.timestamp - this.lastTimestamp);
            }
            this.lastTimestamp = gp.timestamp;
        }

        // Actualitza la barra com a màxim 10 cops per segon
        if (now - this.lastChange > 100) {
            this.lastChange = now;
            this.$bar.firstElementChild!.setAttribute('style', `width:${Math.min(100, (elapsed / DURATION_MS) * 100)}%`);
        }

        if (elapsed >= DURATION_MS) {
            this.finish(elapsed);
            return;
        }

        this.channel.port2.postMessage(0);
    };

    private finish(elapsedMs: number) {
        this.running = false;
        const data = this.intervals.filter(v => v > 0 && v < 1000);

        if (data.length < 10) {
            this.$prompt.textContent = t('pad-test-no-data');
            return;
        }

        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const max = Math.max(...data);
        const hz = Math.round(data.length / (elapsedMs / 1000));

        this.$result.textContent = t('pad-test-result', { hz, avg: avg.toFixed(1), max: max.toFixed(0) });
        this.$prompt.textContent = hz >= 200 && max < 30 ? t('pad-test-excellent') : hz >= 90 ? t('pad-test-good') : t('pad-test-slow');
    }

    private close() {
        this.running = false;
        this.channel.port1.close();
        this.$overlay.remove();
        this.$dialog.remove();
        GamepadTestDialog.open = false;
    }
}
