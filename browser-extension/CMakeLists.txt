cmake_minimum_required(VERSION 3.15)
project(browser-extension-wasm LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Emscripten toolchain check
if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "This CMakeLists.txt must be configured using the Emscripten toolchain (emcmake cmake).")
endif()

set(CORE_ENGINE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../core-engine")

# Declare Wasm module executable target
add_executable(video_editor_wasm
    src/wasm_bindings.cpp
    ${CORE_ENGINE_DIR}/src/VideoTimelineManager.cpp
    ${CORE_ENGINE_DIR}/src/ai_features/AutoSceneDetector.cpp
    ${CORE_ENGINE_DIR}/src/diagnostics/Logger.cpp
    ${CORE_ENGINE_DIR}/src/diagnostics/FrameworkLogBridge.cpp
)

# Includes
target_include_directories(video_editor_wasm PRIVATE
    ${CORE_ENGINE_DIR}/src
)

# Compiler flags and optimizations
target_compile_options(video_editor_wasm PRIVATE
    -O3
    -msimd128                 # Enable 128-bit Wasm SIMD vectorization (matching NEON optimizations)
    "-sUSE_PTHREADS=1"        # Enable multithreading compile support (SharedArrayBuffer)
)

# Emscripten linker options
target_link_options(video_editor_wasm PRIVATE
    "--bind"                                       # Enable Embind wrappers
    "-sWASM=1"                                     # Output WebAssembly bytecode
    "-sALLOW_MEMORY_GROWTH=1"                      # Allow dynamic resizing of Wasm memory heap
    "-sMODULARIZE=1"                               # Package JS into a loadable module function
    "-sEXPORT_ES6=1"                               # Output modern ES6 export module
    "-sEXPORT_NAME=createVideoEditorModule"        # JS factory loader function name
    "-sUSE_PTHREADS=1"                             # Enable Web Worker multithreading (SharedArrayBuffer)
    "-sPTHREAD_POOL_SIZE=4"                        # Pre-allocate 4 browser thread workers
    "-sDYNAMIC_EXECUTION=0"                        # Disable eval() / new Function() for Chrome CSP
    "-msimd128"                                    # Pass SIMD flag to linker
    "-O3"                                          # Aggressive linker optimizations
)

# Set output directory to public/wasm for bundling ease
set_target_properties(video_editor_wasm PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/public/wasm"
)
