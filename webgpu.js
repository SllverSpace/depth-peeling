
class WebGPU {
    meshes = []
    debugShaders = `

        @group(0) @binding(0) var uTexture: texture_2d<f32>;

        struct VertexOut {
            @builtin(position) position : vec4f,
        }

        @vertex
        fn vertex_main(@builtin(vertex_index) vertIndex: u32) -> VertexOut {
            const position = array<vec2f, 6>(
                vec2(-1.0, -1.0),
                vec2(1.0, -1.0),
                vec2(1.0, 1.0),
                vec2(-1.0, -1.0),
                vec2(1.0, 1.0),
                vec2(-1.0, 1.0),
            );
            
            var output : VertexOut;
            output.position = vec4(position[vertIndex], 0.0, 1.0);
            return output;
        }

        @fragment
        fn fragment_main(fragData: VertexOut) -> @location(0) vec4f
        {
            let fragCoord = fragData.position;
            let fragCoords = vec2i(fragCoord.xy);

            let colour = textureLoad(uTexture, fragCoords, 0);

            return colour;
        }
    `
    debugUniforms = {
        texture: [null, 0, 0, 1, false, true, {texture: {sampleType: "float"}}],
    }
    dShaders = `
        @group(0) @binding(0) var<uniform> uView: mat4x4<f32>;
        @group(0) @binding(1) var<uniform> uProjection: mat4x4<f32>;
        @group(0) @binding(2) var<uniform> uModel: mat4x4<f32>;
        @group(0) @binding(3) var uSampler: sampler;
        @group(0) @binding(4) var uTexture: texture_2d<f32>;
        @group(0) @binding(5) var<uniform> useTexture: u32;

        struct VertexOut {
        @builtin(position) position : vec4f,
        @location(0) color : vec4f,
        @location(1) uv : vec2f
        }

        @vertex
        fn vertex_main(@location(0) position: vec4f,
                    @location(1) color: vec4f, @location(2) uv: vec2f) -> VertexOut
        {
            var output : VertexOut;
            output.position = uProjection * uView * uModel * vec4<f32>(position.xyz, 1.0);
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
    dShaderName = "default"
    dUniforms = {
        view: [null, 0, 16*4, 0, true],
        projection: [null, 1, 16*4, 0, true],
        model: [null, 2, 16*4, 0, false],
        sampler: [null, 3, 0, 1, false, true, {sampler: {type: "non-filtering"}}],
        texture: [null, 4, 0, 1, false, true, {texture: {sampleType: "float"}}],
        useTexture: [null, 5, 4, 1, false]
    }
    vertexConfig = {
        entryPoint: "vertex_main",
        buffers: [
            {
                arrayStride: 9 * 4,
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
                    }
                ]
            }
        ]
    }
    dPipelineConfig = {
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: "less",
            format: "depth24plus",
        }
    }
    fragmentConfig = {
        entryPoint: "fragment_main",
        targets: [
            {format: "bgra8unorm"}
        ]
    }
    tShaders = `
        struct SliceInfo {
            sliceStartY: i32
        };

        struct Heads {
            numFragments: atomic<u32>,
            data: array<atomic<u32>>
        };

        struct LinkedListElement {
            color: vec4f,
            depth: f32,
            next: u32
        };

        struct LinkedList {
            data: array<LinkedListElement>
        };

        struct Fragment {
            color: vec4f,
            depth: f32,
        }

        struct PixelData {
            fragments: array<Fragment, 4>
        }

        struct FragmentOutput {
            @location(0) depth: f32, 
            @location(1) colour: vec4f
        }

        @group(0) @binding(0) var<uniform> uView: mat4x4<f32>;
        @group(0) @binding(1) var<uniform> uProjection: mat4x4<f32>;
        @group(0) @binding(2) var<uniform> uModel: mat4x4<f32>;
        @group(0) @binding(3) var uSampler: sampler;
        @group(0) @binding(4) var uTexture: texture_2d<f32>;
        @group(0) @binding(5) var<uniform> useTexture: u32;
       
        @binding(6) @group(0) var solidDepthTexture: texture_depth_2d;

        @binding(7) @group(0) var frontDepthTexture: texture_2d<f32>;
        @binding(8) @group(0) var frontColourTexture: texture_2d<f32>;

        struct VertexOut {
        @builtin(position) position : vec4f,
        @location(0) color : vec4f,
        @location(1) uv : vec2f
        }

        @vertex
        fn vertex_main(@location(0) position: vec4f,
                    @location(1) color: vec4f, @location(2) uv: vec2f) -> VertexOut
        {
            var output : VertexOut;
            output.position = uProjection * uView * uModel * vec4<f32>(position.xyz, 1.0);
            output.color = color;
            output.uv = uv;
            return output;
        }

        @fragment
        fn fragment_main(fragData: VertexOut) -> FragmentOutput
        {
            let fragCoord = fragData.position;
            let fragCoords = vec2i(fragCoord.xy);

            let solidDepth = textureLoad(solidDepthTexture, fragCoords, 0);
            let peelDepth = textureLoad(frontDepthTexture, fragCoords, 0).r;
            let lastFrontColour = textureLoad(frontColourTexture, fragCoords, 0);

            let alphaMultiplier = 1.0 - lastFrontColour.a;

            if fragCoord.z >= solidDepth {
                discard;
            }

            if fragCoord.z <= peelDepth {
                discard;
            }

            var color = fragData.color;
            if useTexture != 0u {
                color = textureSample(uTexture, uSampler, fragData.uv) * fragData.color;
            }

            var output: FragmentOutput;
            output.depth = fragCoord.z;
            output.colour = color;

            // output.colour.r += color.r * color.a * alphaMultiplier;
            // output.colour.g += color.g * color.a * alphaMultiplier;
            // output.colour.b += color.b * color.a * alphaMultiplier;

            // output.colour.a = 1.0 - alphaMultiplier * (1.0 - color.a);

            return output;
        }
    `
    tShaderName = "translucent"
    tUniforms = {
        view: [null, 0, 16*4, 0, true],
        projection: [null, 1, 16*4, 0, true],
        model: [null, 2, 16*4, 0, false],
        sampler: [null, 3, 0, 1, false, true, {sampler: {type: "non-filtering"}}],
        texture: [null, 4, 0, 1, false, true, {texture: {sampleType: "float"}}],
        useTexture: [null, 5, 4, 1, false],
        solidDepthTexture: [null, 6, 0, 1, true, true, {texture: {sampleType: "depth"}}],
        frontDepthTexture: [null, 7, 0, 1, true, true, {texture: {sampleType: "unfilterable-float"}}],
        frontColourTexture: [null, 8, 0, 1, true, true, {texture: {sampleType: "float"}}],
    }
    tFragmentConfig = {
        entryPoint: "fragment_main",
        targets: [
            {format: "r32float", writeMask: GPUColorWrite.RED},
            {format: "rgba8unorm", writeMask: GPUColorWrite.ALL}
        ]
    }
    bShaders = `
        @binding(0) @group(0) var backTexture: texture_2d<f32>;
        @binding(1) @group(0) var frontTexture: texture_2d<f32>;

        @vertex
        fn vertex_main(@builtin(vertex_index) vertIndex: u32) -> @builtin(position) vec4f {
            const position = array<vec2f, 6>(
                vec2(-1.0, -1.0),
                vec2(1.0, -1.0),
                vec2(1.0, 1.0),
                vec2(-1.0, -1.0),
                vec2(1.0, 1.0),
                vec2(-1.0, 1.0),
            );
            
            return vec4(position[vertIndex], 0.0, 1.0);
        }

        @fragment
        fn fragment_main(@builtin(position) position: vec4f) -> @location(0) vec4f {

            let fragCoords = vec2i(position.xy);

            let backColour = textureLoad(backTexture, fragCoords, 0);
            var frontColour = textureLoad(frontTexture, fragCoords, 0);
            let alphaMultiplier = 1.0 - frontColour.a;

            frontColour.r += backColour.r * backColour.a * alphaMultiplier;
            frontColour.g += backColour.g * backColour.a * alphaMultiplier;
            frontColour.b += backColour.b * backColour.a * alphaMultiplier;

            frontColour.a = 1.0 - alphaMultiplier * (1.0 - backColour.a);

            return frontColour;
        }
    `
    bUniforms = {
        back: [null, 0, 0, 1, false, true, {texture: {sampleType: "float"}}],
        front: [null, 1, 0, 1, false, true, {texture: {sampleType: "float"}}],
    }
    bFragmentConfig = {
        targets: [
            {
                format: "rgba8unorm",
            }
        ]
    }
    fShaders = `
        struct SliceInfo {
            sliceStartY: i32
        }

        struct Heads {
            numFragments: u32,
            data: array<u32>
        }

        struct LinkedListElement {
            color: vec4f,
            depth: f32,
            next: u32
        }

        struct LinkedList {
            data: array<LinkedListElement>
        }

        struct Fragment {
            color: vec4f,
            depth: f32,
        }

        struct PixelData {
            fragments: array<Fragment, 4>
        }

        @binding(0) @group(0) var backTexture: texture_2d<f32>;
        @binding(1) @group(0) var frontTexture: texture_2d<f32>;

        @vertex
        fn vertex_main(@builtin(vertex_index) vertIndex: u32) -> @builtin(position) vec4f {
            const position = array<vec2f, 6>(
                vec2(-1.0, -1.0),
                vec2(1.0, -1.0),
                vec2(1.0, 1.0),
                vec2(-1.0, -1.0),
                vec2(1.0, 1.0),
                vec2(-1.0, 1.0),
            );
            
            return vec4(position[vertIndex], 0.0, 1.0);
        }

        @fragment
        fn fragment_main(@builtin(position) position: vec4f) -> @location(0) vec4f {

            let fragCoords = vec2i(position.xy);

            let backColour = textureLoad(backTexture, fragCoords, 0);
            var frontColour = textureLoad(frontTexture, fragCoords, 0);
            let alphaMultiplier = 1.0 - frontColour.a;

            // frontColour.r = frontColour.r * frontColour.a + backColour.r * (1.0 - frontColour.a);
            // frontColour.g = frontColour.g * frontColour.a + backColour.g * (1.0 - frontColour.a);
            // frontColour.b = frontColour.b * frontColour.a + backColour.b * (1.0 - frontColour.a);

            frontColour.r += backColour.r * backColour.a * alphaMultiplier;
            frontColour.g += backColour.g * backColour.a * alphaMultiplier;
            frontColour.b += backColour.b * backColour.a * alphaMultiplier;

            frontColour.a = 1.0 - alphaMultiplier * (1.0 - backColour.a);

            return frontColour;
        }
    `
    fUniforms = {
        back: [null, 0, 0, 1, false, true, {texture: {sampleType: "float"}}],
        front: [null, 1, 0, 1, false, true, {texture: {sampleType: "float"}}],
    }
    fFragmentConfig = {
        targets: [
            {
                format: "bgra8unorm",
                blend: {
                    color: {
                        srcFactor: "one",
                        operation: "add",
                        dstFactor: "one-minus-src-alpha"
                    },
                    alpha: {
                        srcFactor: "one",
                        dstFactor: "one-minus-src-alpha",
                        operation: "add"
                    }
                }
            }
        ]
    }
    shaders = {}
    samplers = []
    meshes = []
    textures = []
    cUseTexture = null 
    ready = false
    gpuTimes = []
    lcwidth = 0
    lcheight = 0
    depthTexture
    depthLayers = 10
    async setup(id="gpucanvas") {
        window.gpucanvas = document.getElementById(id)
        
        if (!navigator.gpu) {
            throw Error("WebGPU not supported.")
        }

        this.adapter = await navigator.gpu.requestAdapter()
        if (!this.adapter) {
            throw Error('Couldn\'t request WebGPU adapter.')
        }
    
        window.device = await this.adapter.requestDevice()

        window.gpuctx = gpucanvas.getContext("webgpu")
        
        gpuctx.configure({
            device: device,
            format: navigator.gpu.getPreferredCanvasFormat(),
            alphaMode: "premultiplied"
        })

        for (let i = 0; i < 4; i++) {
            this.samplers.push(device.createSampler({
                addressModeU: (i & 1) ? "repeat" : "clamp-to-edge",
                addressModeV: (i & 1) ? "repeat" : "clamp-to-edge",
                magFilter: (i & 2) ? "linear" : "nearest",
                minFilter: (i & 2) ? "linear" : "nearest"
            }))
        }

        this.dTexture = device.createTexture({
            format: "rgba8unorm",
            size: [1, 1],
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        })

        for (let texture of this.textures) {
            texture.init(texture.src)
        }

        this.finalMesh = new this.Mesh(0, 0, 0, 0, 0, 0, [], [0], [])
        this.debugMesh = new this.Mesh(0, 0, 0, 0, 0, 0, [], [0], [])
        this.blendMesh = new this.Mesh(0, 0, 0, 0, 0, 0, [], [0], [])

        for (let mesh of this.meshes) {
            this.createShader(mesh.shaderName, mesh.shaders, mesh.uniforms, mesh.vertexConfig, mesh.fragmentConfig, mesh.pipelineConfig)
            let bindGroupLayout = this.shaders[mesh.shaderName].bindGroupLayout
            if (mesh.texture && mesh.texture.loaded) {
                mesh.createBindGroup(bindGroupLayout, [this.samplers[mesh.sampler], mesh.texture.texture.createView()])
            } else {
                mesh.createBindGroup(bindGroupLayout, [this.samplers[0], this.dTexture.createView()])
            }
            mesh.updateBuffers()
        }

        this.createShader("translucent", this.tShaders, this.tUniforms, this.vertexConfig, this.tFragmentConfig, this.dPipelineConfig)
        this.createShader("final", this.fShaders, this.fUniforms, {}, this.fFragmentConfig, {})
        this.createShader("debug", this.debugShaders, this.debugUniforms, {}, this.fragmentConfig, {})
        this.createShader("blend", this.bShaders, this.bUniforms, {}, this.bFragmentConfig, {})

        this.finalMesh.renderA = (passEncoder) => {
            passEncoder.setPipeline(this.shaders.final.pipeline)
            
            passEncoder.setBindGroup(0, this.finalMesh.bindGroups.final)

            passEncoder.draw(6)
        }

        this.debugMesh.renderA = (passEncoder) => {
            passEncoder.setPipeline(this.shaders.debug.pipeline)

            passEncoder.setBindGroup(0, this.debugMesh.bindGroups.debug)

            passEncoder.draw(6)
        }

        this.blendMesh.renderA = (passEncoder) => {
            passEncoder.setPipeline(this.shaders.blend.pipeline)

            passEncoder.setBindGroup(0, this.blendMesh.bindGroups.blend)

            passEncoder.draw(6)
        }

        this.ready = true
        this.onReady()
    }
    setStyles() {
        gpucanvas.style.position = "absolute"
        gpucanvas.style.left = 0
        gpucanvas.style.top = 0
        document.body.style.overflow = "hidden"
    }
    onReady() {

    }
    createShader(name, shaders, uniforms, vertexConfig, fragmentConfig, pipelineConfig) {
        if (!(name in this.shaders)) {
            let shaderModule = device.createShaderModule({
                code: shaders
            })

            let layout = {entries: []}

            uniforms = JSON.parse(JSON.stringify(uniforms))
            for (let name in uniforms) {
                if (uniforms[name][4]) {
                    uniforms[name][0] = device.createBuffer({
                        size: uniforms[name][2],
                        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                    })
                }
                let entry = {
                    binding: uniforms[name][1],
                    visibility: uniforms[name][3] == 0 ? GPUShaderStage.VERTEX : GPUShaderStage.FRAGMENT,
                }
               
                if (uniforms[name][6]) {
                    entry = {...entry, ...uniforms[name][6]}
                } else {
                    entry.buffer = { type: "uniform" }
                }
                layout.entries.push(entry)
            }
    
            let bindGroupLayout = device.createBindGroupLayout(layout)

            let pipelineLayout = device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout]
            })
    
            let pipelineFormat = {
                layout: pipelineLayout, 
                primitive: {
                    topology: "triangle-list",
                },
                vertex: {
                    module: shaderModule,
                    ...vertexConfig
                },
                fragment: {
                    module: shaderModule,
                    ...fragmentConfig,
                },
                ...pipelineConfig
            }
    
            let pipeline = device.createRenderPipeline(pipelineFormat)
            pipelineFormat.primitive.cullMode = "back"
            pipelineFormat.primitive.frontFace = "ccw"
            let cullPipeline = device.createRenderPipeline(pipelineFormat)

            this.shaders[name] = {
                uniforms: uniforms,
                bindGroupLayout: bindGroupLayout,
                pipeline: pipeline,
                cullPipeline: cullPipeline,
                layout: layout,
            }
        }
    }
    createBindGroup(layout, shaderName, customValues=[]) {
        let bLayout = {layout: layout, entries: []}

        let uniforms = this.shaders[shaderName].uniforms

        let uniformsB = {}
        
        for (let name in uniforms) {
            if (!uniforms[name][4] && !uniforms[name][5]) {
                uniformsB[name] = device.createBuffer({
                    size: uniforms[name][2],
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                })
            }
        }

        let i = 0
        for (let name in uniforms) {
            if (!uniforms[name][5]) {
                bLayout.entries.push({
                    binding: uniforms[name][1],
                    resource: {
                        buffer: uniforms[name][4] ? uniforms[name][0] : uniformsB[name]
                    }
                })
            } else {
                bLayout.entries.push({
                    binding: uniforms[name][1],
                    resource: customValues[i] ? customValues[i] : null
                })
                i++
            }
        }
        return [device.createBindGroup(bLayout), uniformsB]
    }
    setShader(passEncoder, shader, cull) {
        if (shader in this.shaders) {
            let pipeline = cull ? this.shaders[shader].cullPipeline : this.shaders[shader].pipeline
            if (pipeline != this.cPipeline) {
                passEncoder.setPipeline(pipeline)
                this.justChanged = true
                this.cPipeline = pipeline
            }
        }
    }
    setGlobalUniform(name, buffer) {
        for (let shader in this.shaders) {
            if (name in webgpu.shaders[shader].uniforms) {
                if (webgpu.shaders[shader].uniforms[name][0]) {
                    device.queue.writeBuffer(webgpu.shaders[shader].uniforms[name][0], 0, buffer, 0, buffer.length)
                }
            }
        }
    }
    async render(background=[0, 0, 0, 1]) {

        var cresized = gpucanvas.width != this.lcwidth || gpucanvas.height != this.lcheight
        this.lcwidth = gpucanvas.width
        this.lcheight = gpucanvas.height

        let solid = []
        let transparent = []
        for (let mesh of this.meshes) {
            if (mesh == this.finalMesh || mesh == this.debugMesh || mesh == this.blendMesh) continue
            if (mesh.transparent) {
                transparent.push(mesh)
            } else {
                solid.push(mesh)
            }
        }

        this.cUseTexture = null

        var commandEncoder = device.createCommandEncoder()

        if (cresized) {
            this.depthTexture = device.createTexture({
                size: [gpucanvas.width, gpucanvas.height],
                format: "depth24plus",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
                label: "depthTexture"
            })
            this.depthPeelTexture = device.createTexture({
                size: [gpucanvas.width, gpucanvas.height],
                format: "r32float",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
                label: "depthPeelTexture"
            })
    
            this.lastDepthPeelTexture = device.createTexture({
                size: [gpucanvas.width, gpucanvas.height],
                format: "r32float",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
                label: "depthPeelTexture"
            })
          
            this.depthPeel2Texture = device.createTexture({
                size: [gpucanvas.width, gpucanvas.height],
                format: "depth24plus",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
                label: "depthPeel2Texture"
            })
            this.frontColourTexture = device.createTexture({
                size: [gpucanvas.width, gpucanvas.height],
                format: "rgba8unorm",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
                label: "frontColourTexture"
            })
            this.blendColourTexture = device.createTexture({
                size: [gpucanvas.width, gpucanvas.height],
                format: "rgba8unorm",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
                label: "blendColourTexture"
            })
    
            this.lastFrontColourTexture = device.createTexture({
                size: [gpucanvas.width, gpucanvas.height],
                format: "rgba8unorm",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
                label: "frontColourTexture"
            })

            for (let mesh of transparent) {
                for (let i = 0; i < 6; i++) delete mesh.bindGroups[i]
            }
        }

        var depthTextureView = this.depthTexture.createView()
        var depthPeelTextureView = this.depthPeelTexture.createView()
        var lastDepthPeelTextureView = this.lastDepthPeelTexture.createView()
        var lastFrontColourTextureView = this.lastFrontColourTexture.createView()
        // var backDepthTextureView = this.backDepthTexture.createView()
        var frontColourTextureView = this.frontColourTexture.createView()
        var textureView = gpuctx.getCurrentTexture().createView()
        var blendColourTextureView = this.blendColourTexture.createView()

        this.clearTexture(commandEncoder, depthPeelTextureView, [0, 0, 0, 0])
        this.clearTexture(commandEncoder, lastDepthPeelTextureView, [0, 0, 0, 0])
        this.clearTexture(commandEncoder, frontColourTextureView, [0, 0, 0, 0])
        this.clearTexture(commandEncoder, lastFrontColourTextureView, [0, 0, 0, 0])
        this.clearTexture(commandEncoder, blendColourTextureView, [0, 0, 0, 0])

        var rots = [frontColourTextureView, lastFrontColourTextureView, blendColourTextureView]

        var renderPassDescriptor = {
            colorAttachments: [{
                clearValue: {r: background[0], g: background[1], b: background[2], a: background[3]},
                loadOp: 'clear',
                storeOp: 'store',
                view: textureView
            }],
            depthStencilAttachment: {
                view: depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        }
    
        var solidEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)
        
        this.cPipeline = null

        for (let mesh of solid) {
            mesh.render(solidEncoder)
        }

        // for (let mesh of transparent) {
        //     mesh.render(solidEncoder)
        // }

        solidEncoder.end()

        for (let i = 0; i < this.depthLayers; i++) {
            // console.log(i % 2 == 0)
            this.cPipeline = null
            renderPassDescriptor = {
                colorAttachments: [{
                    clearValue: {r: 1, g: 0, b: 0, a: 0},
                    loadOp: "clear",
                    storeOp: "store",
                    view: i % 2 == 0 ? depthPeelTextureView : lastDepthPeelTextureView
                },{
                    clearValue: {r: 0, g: 0, b: 0, a: 1},
                    loadOp: "load",
                    storeOp: "store",
                    view: rots[i % 3]
                }],
                depthStencilAttachment: {
                    view: this.depthPeel2Texture.createView(),
                    depthClearValue: 1,
                    depthLoadOp: "clear",
                    depthStoreOp: "store"
                }
            }

            this.clearTexture(commandEncoder, i % 2 == 0 ? depthPeelTextureView : lastDepthPeelTextureView, [0, 0, 0, 0])
            this.clearTexture(commandEncoder, rots[i % 3], [0, 0, 0, 0])

            var transparentEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)

            let lastD = i % 2 == 0 ? lastDepthPeelTextureView : depthPeelTextureView
            let lastC = rots[(i + 1) % 3]
            let id = (i % 2) * 3 + (i % 3)

            for (let mesh of transparent) {
                if (mesh.shaderName != "translucent") {
                    mesh.setShader("translucent", this.tShaders, this.tUniforms, this.vertexConfig, this.tFragmentConfig, this.dPipelineConfig)
                }
                if (!(id in mesh.bindGroups)) {
                    if (mesh.texture && mesh.texture.loaded) {
                        mesh.createBindGroup(this.shaders[mesh.shaderName].bindGroupLayout, [this.samplers[mesh.sampler], mesh.texture ? mesh.texture.texture.createView() : this.dTexture, depthTextureView, lastD, lastC])
                    } else {
                        mesh.createBindGroup(this.shaders[mesh.shaderName].bindGroupLayout, [this.samplers[0], this.dTexture.createView(), depthTextureView, lastD, lastC])
                    }
                    mesh.bindGroups[id] = mesh.bindGroups.translucent
                }
                // if (mesh.texture && mesh.texture.loaded) {
                //     mesh.createBindGroup(this.shaders[mesh.shaderName].bindGroupLayout, [this.samplers[mesh.sampler], mesh.texture ? mesh.texture.texture.createView() : this.dTexture, depthTextureView, lastD, lastC])
                // } else {
                //     mesh.createBindGroup(this.shaders[mesh.shaderName].bindGroupLayout, [this.samplers[0], this.dTexture.createView(), depthTextureView, lastD, lastC])
                // }
                mesh.bindGroups.translucent = mesh.bindGroups[id]

                mesh.render(transparentEncoder)
            } 

            transparentEncoder.end()

            if (i < this.depthLayers-1) {
                renderPassDescriptor = {
                    colorAttachments: [{
                        clearValue: {r: 0, g: 0, b: 0, a: 1},
                        loadOp: 'load',
                        storeOp: 'store',
                        view: rots[(i + 2) % 3]
                    }]
                }

                this.clearTexture(commandEncoder, rots[(i + 2) % 3], [0, 0, 0, 0])
    
                var blendEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)
                this.cPipeline = null
    
                this.blendMesh.setShader("blend", this.bShaders, this.bUniforms, {}, this.bFragmentConfig, {})
                this.blendMesh.createBindGroup(this.shaders.blend.bindGroupLayout, [rots[(i + 0) % 3], rots[(i + 1) % 3]])
                this.blendMesh.render(blendEncoder)
        
                blendEncoder.end()
            }
        }

        // renderPassDescriptor = {
        //     colorAttachments: [{
        //         clearValue: {r: 0, g: 0, b: 0, a: 0},
        //         loadOp: "clear",
        //         storeOp: "store",
        //         view: depthPeelTextureView
        //     },{
        //         clearValue: {r: 0, g: 0, b: 0, a: 1},
        //         loadOp: "load",
        //         storeOp: "store",
        //         view: frontColourTextureView
        //     }],
        //     depthStencilAttachment: {
        //         view: this.depthPeel2Texture.createView(),
        //         depthClearValue: 1,
        //         depthLoadOp: "clear",
        //         depthStoreOp: "store"
        //     }
        // }

        // var transparentEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)

        // // this.debugTexture(commandEncoder, textureView, this.depthTexture)

        // for (let mesh of transparent) {
        //     mesh.setShader("translucent", this.tShaders, this.tUniforms, this.vertexConfig, this.tFragmentConfig, this.dPipelineConfig)
        //     if (mesh.texture && mesh.texture.loaded) {
        //         mesh.createBindGroup(this.shaders[mesh.shaderName].bindGroupLayout, [this.samplers[mesh.sampler], mesh.texture ? mesh.texture.texture.createView() : this.dTexture, depthTextureView, lastDepthPeelTextureView, lastFrontColourTextureView])
        //     } else {
        //         mesh.createBindGroup(this.shaders[mesh.shaderName].bindGroupLayout, [this.samplers[0], this.dTexture.createView(), depthTextureView, lastDepthPeelTextureView, lastFrontColourTextureView])
        //     }

        //     mesh.render(transparentEncoder)
        // }

        // transparentEncoder.end()

        // renderPassDescriptor.colorAttachments[0].view = lastDepthPeelTextureView
        // renderPassDescriptor.colorAttachments[1].view = lastFrontColourTextureView
        // renderPassDescriptor.colorAttachments[1].loadOp = "load"

        // transparentEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)
        // this.cPipeline = null

        // for (let mesh of transparent) {
        //     mesh.setShader("translucent", this.tShaders, this.tUniforms, this.vertexConfig, this.tFragmentConfig, this.dPipelineConfig)
        //     if (mesh.texture && mesh.texture.loaded) {
        //         mesh.createBindGroup(this.shaders[mesh.shaderName].bindGroupLayout, [this.samplers[mesh.sampler], mesh.texture ? mesh.texture.texture.createView() : this.dTexture, depthTextureView, depthPeelTextureView, frontColourTextureView])
        //     } else {
        //         mesh.createBindGroup(this.shaders[mesh.shaderName].bindGroupLayout, [this.samplers[0], this.dTexture.createView(), depthTextureView, depthPeelTextureView, frontColourTextureView])
        //     }
        //     mesh.render(transparentEncoder)
        // }

        // transparentEncoder.end()

        renderPassDescriptor = {
            colorAttachments: [{
                clearValue: {r: 0, g: 0, b: 0, a: 1},
                loadOp: 'load',
                storeOp: 'store',
                view: textureView
            }]
        }

        var finalEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)

        let i = this.depthLayers+1

        this.finalMesh.setShader("final", this.fShaders, this.fUniforms, {}, this.fFragmentConfig, {})
        this.finalMesh.createBindGroup(this.shaders.final.bindGroupLayout, [rots[(i + 1) % 3], rots[(i + 2) % 3]])
        this.finalMesh.render(finalEncoder)

        finalEncoder.end()

        // this.debugTexture(commandEncoder, textureView, rots[(i + 1) % 3])
        
        let start = performance.now()
        device.queue.submit([commandEncoder.finish()])
        await device.queue.onSubmittedWorkDone()

        this.gpuTimes.push(performance.now() - start)
        if (this.gpuTimes.length > 100) this.gpuTimes.splice(0, 1)
    }
    clearTexture(commandEncoder, textureView, clearColour) {
        var renderPassDescriptor = {
            colorAttachments: [{
                clearValue: {r: clearColour[0], g: clearColour[1], b: clearColour[2], a: clearColour[3]},
                loadOp: "clear",
                storeOp: 'store',
                view: textureView
            }]
        }

        var pass = commandEncoder.beginRenderPass(renderPassDescriptor)

        pass.end()
    }
    debugTexture(commandEncoder, canvasView, textureView) {

        var renderPassDescriptor = {
            colorAttachments: [{
                clearValue: {r: 0, g: 0, b: 0, a: 1},
                loadOp: 'clear',
                storeOp: 'store',
                view: canvasView
            }]
        }

        let pass = commandEncoder.beginRenderPass(renderPassDescriptor)

        this.debugMesh.setShader("debug", this.debugShaders, this.debugUniforms, {}, this.fragmentConfig, {})
        this.debugMesh.createBindGroup(this.shaders.debug.bindGroupLayout, [textureView])
        this.debugMesh.render(pass)

        pass.end()
    }
    get Texture() {
        return class {
            loaded = false
            connected = []
            constructor(src) {
                this.src = src
                webgpu.textures.push(this)
                if (webgpu.ready) {
                    this.init(src)
                }
            }
            async init(src) {
                let img = new Image()
                img.src = src
                await img.decode()

                let canvas = document.createElement("canvas")
                let ctx = canvas.getContext("2d")
                canvas.width = img.width
                canvas.height = img.height
                ctx.drawImage(img, 0, 0)

                let bitmap = await createImageBitmap(canvas)
                this.texture = device.createTexture({
                    format: "rgba8unorm",
                    size: [bitmap.width, bitmap.height],
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
                })
                device.queue.copyExternalImageToTexture(
                    { source: bitmap, flipY: true },
                    { texture: this.texture },
                    { width: bitmap.width, height: bitmap.height },
                )

                this.loaded = true

                if (webgpu.ready) {
                    for (let mesh of this.connected) {
                        if (!mesh.transparent) {
                            mesh.createBindGroup(webgpu.shaders[mesh.shaderName].bindGroupLayout, [webgpu.samplers[mesh.sampler], this.texture.createView()])
                        } else {
                            for (let i = 0; i < 6; i++) delete mesh.bindGroups[i]
                        }
                    }
                }
            }
        }
    }
    get Mesh() {
        return class {
            uniformsB = {}
            oneSide = false
            texture = null
            useTexture = false
            sampler = 0
            customBuffers = []
            transparent = false
            bindGroupInfo = null
            bindGroups = {}
            updateModel = true
            model
            constructor(x, y, z, width, height, depth, vertices=[], faces=[], colours=[]) {
                this.pos = {x: x, y: y, z: z}
                this.size = {x: width, y: height, z: depth}
                this.rot = {x: 0, y: 0, z: 0}
                this.vertices = vertices
                this.colours = colours
                this.faces = faces
                this.uvs = []
                this.shaderName = webgpu.dShaderName
                this.shaders = webgpu.dShaders
                this.uniforms = webgpu.dUniforms
                this.vertexConfig = webgpu.vertexConfig
                this.fragmentConfig = webgpu.fragmentConfig
                this.pipelineConfig = webgpu.dPipelineConfig
                webgpu.meshes.push(this)
                if (webgpu.ready) {
                    webgpu.createShader(this.shaderName, this.shaders, this.uniforms, this.vertexConfig, this.fragmentConfig, this.pipelineConfig)
                    this.createBindGroup(webgpu.shaders[this.shaderName].bindGroupLayout, [webgpu.samplers[0], webgpu.dTexture])
                    this.updateBuffers()
                }
            }
            setShader(shaderName, shaders, uniforms, vertexConfig, fragmentConfig, pipelineConfig) {
                this.shaderName = shaderName
                this.shaders = shaders
                this.uniforms = uniforms
                this.vertexConfig = vertexConfig
                this.fragmentConfig = fragmentConfig
                this.pipelineConfig = pipelineConfig
                if (webgpu.ready) webgpu.createShader(shaderName, shaders, uniforms, vertexConfig, fragmentConfig, pipelineConfig)
            }
            setTexture(texture) {
                this.texture = texture
                this.useTexture = true
                texture.connected.push(this)
                if (texture.loaded) {
                    if (webgpu.ready && this.transparent) {
                        this.createBindGroup(webgpu.shaders[this.shaderName].bindgroupLayout, [webgpu.samplers[this.sampler], this.texture.texture.createView()])
                    }
                }
            }
            delete() {
                if (this.texture) {
                    this.texture.splice(this.texture.indexOf(this), 1)
                }
                webgpu.meshes.splice(webgpu.meshes.indexOf(this), 1)
            }
            createBindGroup(layout, customValues=[]) {
                let bLayout = {layout: layout, entries: []}

                let uniforms = webgpu.shaders[this.shaderName].uniforms
                
                for (let name in uniforms) {
                    if (!uniforms[name][4] && !uniforms[name][5]) {
                        this.uniformsB[name] = device.createBuffer({
                            size: uniforms[name][2],
                            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                        })
                    }
                }

                let i = 0
                for (let name in uniforms) {
                    if (!uniforms[name][5]) {
                        bLayout.entries.push({
                            binding: uniforms[name][1],
                            resource: {
                                buffer: uniforms[name][4] ? uniforms[name][0] : this.uniformsB[name]
                            }
                        })
                    } else {
                        bLayout.entries.push({
                            binding: uniforms[name][1],
                            resource: customValues[i] ? customValues[i] : null
                        })
                        i++
                    }
                }
                try {
                    this.bindGroups[this.shaderName] = device.createBindGroup(bLayout)
                } catch (e) {
                    console.log(bLayout)
                    console.error(e)
                }
            }
            updateBuffers() {
                if (!window.device) return
                let vertexes = []
                for (let i = 0; i < this.vertices.length/3; i++) {
                    let vertex = [
                        this.vertices[i*3], this.vertices[i*3+1], this.vertices[i*3+2], 
                        this.colours[i*4], this.colours[i*4+1], this.colours[i*4+2], this.colours[i*4+3],
                        this.uvs[i*2] ? this.uvs[i*2] : 0, this.uvs[i*2+1] ? this.uvs[i*2+1] : 0
                    ]
                    for (let buffer of this.customBuffers) {
                        for (let i2 = 0; i2 < buffer[0]; i2++) {
                            vertex.push(buffer[1][i*buffer[0]+i2])
                        }
                    }
                    vertexes.push(...vertex)
                }
                vertexes = new Float32Array(vertexes)
                let indexes = new Uint32Array(this.faces)

                this.vertexBuffer = device.createBuffer({
                    size: vertexes.byteLength,
                    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                })
                device.queue.writeBuffer(this.vertexBuffer, 0, vertexes, 0, vertexes.length)

                this.indexBuffer = device.createBuffer({
                    size: indexes.byteLength,
                    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
                })
                device.queue.writeBuffer(this.indexBuffer, 0, indexes, 0, indexes.length)
            }
            renderA(passEncoder) {
                webgpu.setShader(passEncoder, this.shaderName, this.oneSide)

                passEncoder.setVertexBuffer(0, this.vertexBuffer)
                passEncoder.setIndexBuffer(this.indexBuffer, "uint32")

                if (this.updateModel) {
                    this.model = getModelMatrix(this.pos.x, this.pos.y, this.pos.z, this.rot.x, this.rot.y, this.rot.z, this.size.x, this.size.y, this.size.z)
                }
                let modelMatrix = this.model

                // // if (webgpu.justChanged) {
                // //     // console.log(this.shaderName, webgpu.setGlobals)
                // //     for (let name in webgpu.setGlobals) {
                // //         device.queue.writeBuffer(webgpu.shaders[this.shaderName].uniforms[name][0], 0, webgpu.setGlobals[name], 0, webgpu.setGlobals[name].length)
                // //     }
                // //     webgpu.justChanged = false
                // // }

                // device.queue.writeBuffer(webgpu.shaders[this.shaderName].uniforms["view"][0], 0, viewProjection, 0, viewProjection.length)
                device.queue.writeBuffer(this.uniformsB.model, 0, modelMatrix, 0, modelMatrix.length)

                if (this.useTexture != webgpu.cUseTexture) {
                    let utBuffer = new Uint32Array([this.useTexture ? 1 : 0])
                    device.queue.writeBuffer(this.uniformsB.useTexture, 0, utBuffer, 0, utBuffer.length)
                    webgpu.cUseTexture = this.useTexture
                }

                if (this.bindGroupInfo) {
                    passEncoder.setBindGroup(0, this.bindGroups[this.shaderName], this.bindGroupInfo)
                } else {
                    passEncoder.setBindGroup(0, this.bindGroups[this.shaderName])
                }
            
                passEncoder.drawIndexed(this.faces.length, 1, 0, 0, 0)
            }
            render(passEncoder) {
                if (this.faces.length <= 0) return
                if (this.texture != null) {
                    if (!this.texture.loaded) return
                }
                this.renderA(passEncoder)
            }
        }
    }

    get Box() {
		return class extends webgpu.Mesh {
			lastColour = []
			colour = [0, 0, 0, 1]
			visible = true
			shading = true
			constructor(x, y, z, width, height, depth, colour, centerRot=true) {
				super(x, y, z, width, height, depth, [],[
					// +Z
					16, 17, 18,
					19, 17, 16,
					// -X
					4, 5, 6,
					7, 5, 4,
					// +X
					2, 1, 0,
					0, 1, 3,
					// -Z
					22, 21, 20,
					20, 21, 23,
					// -Y
					14, 13, 12,
					12, 13, 15,
					// +Y
					8, 9, 10,
					11, 9, 8,
				])
				this.oneSide = true
				this.colour = colour
				if (centerRot) {
					this.rotOff = {x: -width/2, y: -height/2, z: -depth/2}
				}
                this.updateShape()
			}
            setUvs(offx=0, offy=0, offw=1, offh=1) {
                this.uvs = []
                for (let i = 0; i < 6; i++) {
                    this.uvs.push(
                        offx+offw, offy+offh,
                        offx, offy,
                        offx, offy+offh,
                        offx+offw, offy,
                    )
                }
                this.updateBuffers()
            }
			updateShape(o=0) {
				this.vertices = [
					// +X
					0.5-o, 0.5, 0.5,
					0.5-o, -0.5, -0.5,
					0.5-o, 0.5, -0.5,
					0.5-o, -0.5, 0.5,
					// -X
					-0.5+o, 0.5, 0.5,
					-0.5+o, -0.5, -0.5,
					-0.5+o, 0.5, -0.5,
					-0.5+o, -0.5, 0.5,
					// +Y
					0.5, 0.5-o, 0.5,
					-0.5, 0.5-o, -0.5,
					0.5, 0.5-o, -0.5,
					-0.5, 0.5-o, 0.5,
					// -Y
					0.5, -0.5+o, 0.5,
					-0.5, -0.5+o, -0.5,
					0.5, -0.5+o, -0.5,
					-0.5, -0.5+o, 0.5,
					// +Z
					0.5, 0.5, -0.5+o,
					-0.5, -0.5, -0.5+o,
					0.5, -0.5, -0.5+o,
					-0.5, 0.5, -0.5+o,
					// -Z
					0.5, 0.5, 0.5-o,
					-0.5, -0.5, 0.5-o,
					0.5, -0.5, 0.5-o,
					-0.5, 0.5, 0.5-o,
				]
                this.updateBuffers()
			}
			render(passEncoder) {
				if (!this.visible) { return }
				if (JSON.stringify(this.colour) != JSON.stringify(this.lastColour)) {
					this.colours = []
					if (this.shading) {
						// +X
						for (let i = 0; i < 4; i++) {
							this.colours.push(this.colour[0]*0.85, this.colour[1]*0.85, this.colour[2]*0.85, this.colour[3])
						}
						// -X
						for (let i = 0; i < 4; i++) {
							this.colours.push(this.colour[0]*0.7, this.colour[1]*0.7, this.colour[2]*0.7, this.colour[3])
						}
						// +Y
						for (let i = 0; i < 4; i++) {
							this.colours.push(this.colour[0]*1, this.colour[1]*1, this.colour[2]*1, this.colour[3])
						}
						// -Y
						for (let i = 0; i < 4; i++) {
							this.colours.push(this.colour[0]*0.55, this.colour[1]*0.55, this.colour[2]*0.55, this.colour[3])
						}
						// +Z
						for (let i = 0; i < 4; i++) {
							this.colours.push(this.colour[0]*0.75, this.colour[1]*0.75, this.colour[2]*0.75, this.colour[3])
						}
						// -Z
						for (let i = 0; i < 4; i++) {
							this.colours.push(this.colour[0]*0.6, this.colour[1]*0.6, this.colour[2]*0.6, this.colour[3])
						}
					} else {
						for (let i = 0; i < 4*6; i++) {
							this.colours.push(this.colour[0]*1, this.colour[1]*1, this.colour[2]*1, this.colour[3])
						}
					}
					
					this.updateBuffers()
				}
				this.lastColour = [...this.colour]
				// this.pos.x -= this.size.x/2
				// this.pos.y -= this.size.y/2
				// this.pos.z -= this.size.z/2
				super.render(passEncoder)
				// this.pos.x += this.size.x/2
				// this.pos.y += this.size.y/2
				// this.pos.z += this.size.z/2
			}
		}
	}
}

var webgpu = new WebGPU()