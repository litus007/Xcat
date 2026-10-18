// @ts-ignore
declare const arguments: any;

const $dom = arguments[1];
if ($dom && $dom instanceof HTMLElement && $dom.id === 'gamepass-dialog-root') {
    let showing = false;
    const $child = $dom.firstElementChild;
    const $dialog = $child?.firstElementChild;
    if ($dialog) {
        showing = !$dialog.className.includes('pageChangeExit');
    }
    window.BxEventBus.Script.emit(showing ? 'dialog.shown' : 'dialog.dismissed', {});
}
