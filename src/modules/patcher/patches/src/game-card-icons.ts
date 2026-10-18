declare const $supportedInputIcons$: Array<any>;
declare const $productId$: string;

const supportedInputIcons = $supportedInputIcons$;
const productId = $productId$;

// Remove controller icon
supportedInputIcons.shift();

if (window.BX_EXPOSED.localCoOpManager!.isSupported(productId)) {
    supportedInputIcons.push(window.BX_EXPOSED.createReactLocalCoOpIcon);
}
