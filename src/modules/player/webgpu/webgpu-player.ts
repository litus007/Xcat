import { compressCodeFile } from "@macros/build" with { type: "macro" };

import { BaseCanvasPlayer } from "../base-canvas-player";
import { StreamPlayerType } from "@/enums/pref-values";
import { BxEventBus } from "@/utils/bx-event-bus";
import { BX_FLAGS } from "@/utils/bx-flags";

export class WebGPUPlayer extends BaseCanvasPlayer {
    static device: GPUDevice;

    context!: GPUCanvasContext | null;
    pipeline!: GPURenderPipeline | null;
    sampler!: GPUSampler | null;
    bindGroup!: GPUBindGroup | null;
    optionsUpdated: boolean = false;
    paramsBuffer!: GPUBuffer | null;
    vertexBuffer!: GPUBuffer | null;

    static async prepare(): Promise<void> {
        if (!BX_FLAGS.EnableWebGPURenderer || !navigator.gpu) {
            BxEventBus.Script.emit('webgpu.ready', {});
            return;
        }

        try {
            const adapter = await navigator.gpu.requestAdapter();

            if (adapter) {
                WebGPUPlayer.device = await adapter.requestDevice();
                WebGPUPlayer.device?.addEventListener('uncapturederror', e => {
                    console.error((e as GPUUncapturedErrorEvent).error.message);
                });
            }
        } catch (ex) {
            console.error('WebGPU: no s\'ha pogut obtenir el dispositiu', ex);
        }

        BxEventBus.Script.emit('webgpu.ready', {});
    }

    constructor($video: HTMLVideoElement) {
        super(StreamPlayerType.WEBGPU, $video, 'WebGPUPlayer');
    }

    protected setupShaders(): void {
        this.context = this.$canvas.getContext('webgpu')!;
        if (!this.context) {
            console.error('WebGPU: no es pot iniciar el context');
            return;
        }

        const format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: WebGPUPlayer.device,
            format,
            alphaMode: 'opaque',
        });

        this.vertexBuffer = WebGPUPlayer.device.createBuffer({
            label: 'vertex buffer',
            size: 6 * 4, // 6 floats (2 per vertex)
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });

        const mappedRange = this.vertexBuffer.getMappedRange();
        new Float32Array(mappedRange).set([
            -1, 3,  // Vertex 1
            -1, -1, // Vertex 2
            3, -1,  // Vertex 3
        ]);
        this.vertexBuffer.unmap();

        const shaderModule = WebGPUPlayer.device.createShaderModule({ code: compressCodeFile('./src/modules/player/webgpu/shaders/clarity-boost.wgsl') as any as string });
        this.pipeline = WebGPUPlayer.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vsMain',
                buffers: [{
                    arrayStride: 8,
                    attributes: [{
                        format: 'float32x2',
                        offset: 0,
                        shaderLocation: 0,
                    }],
                }],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fsMain',
                targets: [{ format }],
            },
            primitive: { topology: 'triangle-list' },
        });

        this.sampler = WebGPUPlayer.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
        this.updateCanvas();
    }

    private prepareUniformBuffer(value: any, classType: any) {
        const uniform = new classType(value);
        const uniformBuffer = WebGPUPlayer.device.createBuffer({
            size: uniform.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        WebGPUPlayer.device.queue.writeBuffer(uniformBuffer, 0, uniform);
        return uniformBuffer;
    }

    private updateCanvas() {
        const externalTexture = WebGPUPlayer.device.importExternalTexture({ source: this.$video });

        if (!this.optionsUpdated) {
            this.paramsBuffer = this.prepareUniformBuffer([
                this.toFilterId(this.options.processing),
                this.options.sharpness,
                this.options.brightness / 100,
                this.options.contrast / 100,
                this.options.saturation / 100,
            ], Float32Array);

            this.optionsUpdated = true;
        }

        this.bindGroup = WebGPUPlayer.device.createBindGroup({
            layout: this.pipeline!.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.sampler },
                { binding: 1, resource: externalTexture as any },
                { binding: 2, resource: { buffer: this.paramsBuffer } },
            ],
        });
    }

    updateFrame(): void {
        this.updateCanvas();

        const commandEncoder = WebGPUPlayer.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context!.getCurrentTexture().createView(),
                loadOp: 'clear',
                storeOp: 'store',
                clearValue: [0.0, 0.0, 0.0, 1.0],
            }]
        });

        passEncoder.setPipeline(this.pipeline!);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.setVertexBuffer(0, this.vertexBuffer);
        passEncoder.draw(3);
        passEncoder.end();

        WebGPUPlayer.device.queue.submit([commandEncoder.finish()]);
    }

    refreshPlayer(): void {
        this.optionsUpdated = false;
        this.updateCanvas();
    }

    destroy(): void {
        super.destroy();

        this.isStopped = true;

        // Unset GPU resources
        this.pipeline = null;
        this.bindGroup = null;
        this.sampler = null;

        this.paramsBuffer?.destroy();
        this.paramsBuffer = null;

        this.vertexBuffer?.destroy();
        this.vertexBuffer = null;

        // Reset the WebGPU context (force garbage collection)
        if (this.context) {
            this.context.unconfigure();
            this.context = null;
        }

        console.log('WebGPU context successfully freed.');
    }
}
