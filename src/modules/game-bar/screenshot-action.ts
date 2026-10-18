import { BxIcon } from "@utils/bx-icon";
import { createButton, ButtonStyle } from "@utils/html";
import { BaseGameBarAction } from "./base-action";
import { t } from "@utils/translation";
import { ScreenshotManager } from "@/utils/screenshot-manager";

export class ScreenshotAction extends BaseGameBarAction {
    $content: HTMLElement;

    constructor() {
        super();

        this.$content = createButton({
            style: ButtonStyle.GHOST,
            icon: BxIcon.SCREENSHOT,
            title: t('take-screenshot'),
            onClick: this.onClick,
        });
    }

    onClick = (e: Event) => {
        super.onClick(e);
        ScreenshotManager.getInstance().takeScreenshot();
    }
}
