import type { MicrophoneState } from "@/modules/shortcuts/microphone-shortcut";
import { BxEvent as BxEventNamespace } from "@/utils/bx-event";

declare const $this$: any;
declare const BxEvent: typeof BxEventNamespace;

const self = $this$;
window.BX_EXPOSED.streamSession = self;

// Patch setMicrophoneState()
const orgSetMicrophoneState = self.setMicrophoneState.bind(self);
self.setMicrophoneState = (state: MicrophoneState) => {
    orgSetMicrophoneState(state);
    window.BxEventBus.Stream.emit('microphone.state.changed', { state });
};

window.dispatchEvent(new Event(BxEvent.STREAM_SESSION_READY));

// Patch updateDimensions() to make native touch work correctly with WebGL2
let updateDimensionsStr = self.updateDimensions.toString();

if (updateDimensionsStr.startsWith('function ')) {
    updateDimensionsStr = updateDimensionsStr.substring(9);
}

// if(r){
const renderTargetVar = updateDimensionsStr.match(/if\((\w+)\){/)[1];

updateDimensionsStr = updateDimensionsStr.replaceAll(renderTargetVar + '.scroll', 'scroll');
updateDimensionsStr = updateDimensionsStr.replace(`if(${renderTargetVar}){`, `
if (${renderTargetVar}) {
    const scrollWidth = ${renderTargetVar}.dataset.width ? parseInt(${renderTargetVar}.dataset.width) : ${renderTargetVar}.scrollWidth;
    const scrollHeight = ${renderTargetVar}.dataset.height ? parseInt(${renderTargetVar}.dataset.height) : ${renderTargetVar}.scrollHeight;
`);

eval(`this.updateDimensions = function ${updateDimensionsStr}`);
