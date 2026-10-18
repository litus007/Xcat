// @ts-ignore
declare let $guideUI$: any;
declare const $onShowStreamMenu$: any;
declare const $offset$: any;

// Expose onShowStreamMenu
window.BX_EXPOSED.showStreamMenu = $onShowStreamMenu$;
// Restore the "..." button
$guideUI$ = null;

window.BX_EXPOSED.reactUseEffect(() => {
    window.BxEventBus.Stream.emit('ui.streamHud.rendered', { expanded: $offset$.x === 0 });
});
