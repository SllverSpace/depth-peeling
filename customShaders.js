
var grassShaders = `
    @group(0) @binding(0) var<uniform> uView: mat4x4<f32>;
    @group(0) @binding(1) var<uniform> uProjection: mat4x4<f32>;
    @group(0) @binding(2) var<uniform> uModel: mat4x4<f32>;
    @group(0) @binding(3) var uSampler: sampler;
    @group(0) @binding(4) var uTexture: texture_2d<f32>;
    @group(0) @binding(5) var<uniform> useTexture: u32;
    @group(0) @binding(6) var<uniform> time: f32;
    @group(0) @binding(7) var<uniform> camera: vec3<f32>;

    struct VertexOut {
    @builtin(position) position : vec4f,
    @location(0) color : vec4f,
    @location(1) uv : vec2f
    }

    fn hash(seed: u32) -> f32 {
        var x = u32(seed);
        x = ((x >> 16u) ^ x) * 0x45d9f3bu;
        x = ((x >> 16u) ^ x) * 0x45d9f3bu;
        x = (x >> 16u) ^ x;
        return f32(x) / f32(0xffffffffu);
    }

    @vertex
    fn vertex_main(@builtin(vertex_index) vertexIndex: u32, @location(0) position: vec4f,
                @location(1) color: vec4f, @location(2) uv: vec2f, @location(3) id: f32) -> VertexOut
    {  
        var gridSize : f32 = 300;
        var size : f32 = 20 / gridSize;

        var pos : vec4<f32> = position;
        var id2 = round(id * gridSize * gridSize);
        var x = round(id2 / gridSize - 0.5);
        var y = id2 % gridSize;

        var top = vertexIndex % 3 == 0;

        var off : vec2<f32> = vec2(0, 0);

        pos.x += (hash(u32(id2))*2-1) / 5;
        pos.z += (hash(u32(id2 + 94823))*2-1) / 5;

        off.x += (hash(vertexIndex)*2-1) * size*1.5;
        off.y += (hash(vertexIndex+493045)*2-1) * size*1.5;
        
        if (top) {
            pos.x += sin(time + (x/gridSize)*20) * size;
            pos.z += sin(time + 58294 + (y/gridSize)*20) * size;
        }

        var moved : f32 = 10;

        var d = sqrt(pow((camera.x-pos.x+moved), 2) + pow((camera.y-pos.y+1) / 2, 2) + pow((camera.z-pos.z+moved), 2))/1.5;
        var factor = 1.0-min(1, max(0, d));

        if (top) {
            pos.x += (off.x) * (factor*3);
            pos.z += (off.y) * (factor*3);
            pos.y -= factor/2 * size * 7.5 * 2;
        } else {
            pos.x += off.x;
            pos.z += off.y;
        }

        var output : VertexOut;
        output.position = uProjection * uView * uModel * vec4<f32>(pos.xyz, 1.0);
        output.color = color;
        output.uv = uv;
        return output;
    }

    

    @fragment
    fn fragment_main(fragData: VertexOut) -> @location(0) vec4f
    {
        var color = fragData.color;
        if (useTexture != 0u) {
            color = textureSample(uTexture, uSampler, fragData.uv) * fragData.color;
        }
        return color;
    }
`
var grassVertexConfig = {
    entryPoint: "vertex_main",
    buffers: [
        {
            arrayStride: 10 * 4,
            attributes: [
                {
                    shaderLocation: 0,
                    offset: 0,
                    format: "float32x3"
                },
                {
                    shaderLocation: 1,
                    offset: 4 * 3,
                    format: "float32x4"
                },
                {
                    shaderLocation: 2,
                    offset: 4 * 7,
                    format: "float32x2"
                },
                {
                    shaderLocation: 3,
                    offset: 4 * 9,
                    format: "float32"
                }
            ]
        }
    ]
}
var grassUniforms = {
    view: [null, 0, 16*4, 0, true],
    projection: [null, 1, 16*4, 0, true],
    model: [null, 2, 16*4, 0, false],
    sampler: [null, 3, 0, 1, false, true, {sampler: {type: "non-filtering"}}],
    texture: [null, 4, 0, 1, false, true, {texture: {sampleType: "float"}}],
    useTexture: [null, 5, 4, 1, false],
    time: [null, 6, 4, 0, true],
    camera: [null, 7, 3*4, 0, true]
}