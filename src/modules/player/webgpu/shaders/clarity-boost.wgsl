struct Params {
    filterId: f32,
    sharpness: f32,
    brightness: f32,
    contrast: f32,
    saturation: f32,
};


struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};


@group(0) @binding(0) var ourSampler: sampler;
@group(0) @binding(1) var ourTexture: texture_external;
@group(0) @binding(2) var<uniform> ourParams: Params;


const FILTER_UNSHARP_MASKING: f32 = 1.0;
const CAS_CONTRAST_PEAK: f32 = 0.8 * -3.0 + 8.0;
// Luminosity factor: https://www.w3.org/TR/AERT/#color-contrast
const LUMINOSITY_FACTOR = vec3(0.299, 0.587, 0.114);

@vertex
fn vsMain(@location(0) pos: vec2<f32>) -> VertexOutput {
    var out: VertexOutput;
    out.position = vec4(pos, 0.0, 1.0);
    // Flip the Y-coordinate of UVs
    out.uv = (vec2(pos.x, 1.0 - (pos.y + 1.0)) + vec2(1.0, 1.0)) * 0.5;
    return out;
}


fn clarityBoost(coord: vec2<f32>, texSize: vec2<f32>, e: vec3<f32>) -> vec3<f32> {
    let texelSize = 1.0 / texSize;

    // Load 3x3 neighborhood samples
    let a = textureSampleBaseClampToEdge(ourTexture, ourSampler, coord + texelSize * vec2(-1.0,  1.0)).rgb;
    let b = textureSampleBaseClampToEdge(ourTexture, ourSampler, coord + texelSize * vec2( 0.0,  1.0)).rgb;
    let c = textureSampleBaseClampToEdge(ourTexture, ourSampler, coord + texelSize * vec2( 1.0,  1.0)).rgb;

    let d = textureSampleBaseClampToEdge(ourTexture, ourSampler, coord + texelSize * vec2(-1.0,  0.0)).rgb;
    let f = textureSampleBaseClampToEdge(ourTexture, ourSampler, coord + texelSize * vec2( 1.0,  0.0)).rgb;

    let g = textureSampleBaseClampToEdge(ourTexture, ourSampler, coord + texelSize * vec2(-1.0, -1.0)).rgb;
    let h = textureSampleBaseClampToEdge(ourTexture, ourSampler, coord + texelSize * vec2( 0.0, -1.0)).rgb;
    let i = textureSampleBaseClampToEdge(ourTexture, ourSampler, coord + texelSize * vec2( 1.0, -1.0)).rgb;

    // Unsharp Masking (USM)
    if ourParams.filterId == FILTER_UNSHARP_MASKING {
        let gaussianBlur = (a + c + g + i) * 1.0 + (b + d + f + h) * 2.0 + e * 4.0;
        let blurred = gaussianBlur / 16.0;
        return e + (e - blurred) * (ourParams.sharpness / 3.0);
    }

    // Contrast Adaptive Sharpening (CAS)
    let minRgb = min(min(min(d, e), min(f, b)), h) + min(min(a, c), min(g, i));
    let maxRgb = max(max(max(d, e), max(f, b)), h) + max(max(a, c), max(g, i));

    let reciprocalMaxRgb = 1.0 / maxRgb;
    var amplifyRgb = clamp(min(minRgb, 2.0 - maxRgb) * reciprocalMaxRgb, vec3(0.0), vec3(1.0));
    amplifyRgb = 1.0 / sqrt(amplifyRgb);

    let weightRgb = -(1.0 / (amplifyRgb * CAS_CONTRAST_PEAK));
    let reciprocalWeightRgb = 1.0 / (4.0 * weightRgb + 1.0);

    let window = b + d + f + h;
    let outColor = clamp((window * weightRgb + e) * reciprocalWeightRgb, vec3(0.0), vec3(1.0));

    return mix(e, outColor, ourParams.sharpness / 2.0);
}


@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(ourTexture));
    let center = textureSampleBaseClampToEdge(ourTexture, ourSampler, input.uv);
    var adjustedRgb = clarityBoost(input.uv, texSize, center.rgb);

    // Compute grayscale intensity
    let gray = dot(adjustedRgb, LUMINOSITY_FACTOR);
    // Interpolate between grayscale and color
    adjustedRgb = mix(vec3(gray), adjustedRgb, ourParams.saturation);

    // Adjust contrast
    adjustedRgb = (adjustedRgb - 0.5) * ourParams.contrast + 0.5;

    // Adjust brightness
    adjustedRgb *= ourParams.brightness;
    return vec4(adjustedRgb, 1.0);
}
