declare const $this$: any;
declare const e: string;

try {
    const msg = JSON.parse(e);
    if (msg.reason === 'WarningForBeingIdle' && window.location.pathname.includes('/play/consoles/launch/')) {
        $this$.sendKeepAlive();
        // @ts-ignore
        return;
    }
} catch (ex) { console.log(ex); }
