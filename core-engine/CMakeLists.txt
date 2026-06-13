cmake_minimum_required(VERSION 3.15)
project(core-engine LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Platform / Architecture Check
if(CMAKE_SYSTEM_PROCESSOR MATCHES "ARM64" OR CMAKE_SYSTEM_PROCESSOR MATCHES "arm64" OR CMAKE_VS_PLATFORM_NAME MATCHES "ARM64")
    message(STATUS "Configuring build for Target Architecture: Windows ARM64")
else()
    message(STATUS "Configuring build for Architecture: ${CMAKE_SYSTEM_PROCESSOR} (Cross-compiling target recommended: ARM64)")
endif()

# Compiler specific flags for ARM64 optimizations
if(MSVC)
    # MSVC ARM64 optimizations
    # NEON vectorization is enabled by default on MSVC ARM64.
    add_compile_options(
        /O2                 # Max optimization for speed
        /Oi                 # Enable intrinsics
        /Ot                 # Favor fast code
        /Ob2                # Aggressive inline expansion
        /Gy                 # Function-level linking
        /GF                 # Eliminate duplicate strings
        /Gw                 # Whole program data optimization
    )
    # Add link-time code generation flags for release configurations
    set(CMAKE_SHARED_LINKER_FLAGS_RELEASE "${CMAKE_SHARED_LINKER_FLAGS_RELEASE} /LTCG")
    set(CMAKE_EXE_LINKER_FLAGS_RELEASE "${CMAKE_EXE_LINKER_FLAGS_RELEASE} /LTCG")
elseif(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    # Clang-cl or Clang native optimizations
    add_compile_options(
        -O3
        -mcpu=cortex-a78     # Snapdragon optimization target
        -ffast-math          # Allow floating-point optimizations
        -ftree-vectorize     # Enable loop vectorization
    )
endif()

# Dependency Management: Locate MLT Framework (libmlt and libmlt++)
# We allow setting custom search paths for Windows / ARM64 environments
set(MLT_SEARCH_PATH "" CACHE PATH "Custom search path for MLT SDK / Headers / Libs")

find_package(PkgConfig QUIET)

# 1. Try finding via PkgConfig
if(PKG_CONFIG_FOUND)
    pkg_check_modules(MLT mlt-7 IMPORTED_TARGET)
    pkg_check_modules(MLTPP mlt++-7 IMPORTED_TARGET)
endif()

# 2. Fallback: Manual search or Cache variables (especially for Windows ARM64 builds)
if(NOT MLT_FOUND OR NOT MLTPP_FOUND)
    message(STATUS "MLT/MLTPP not found via PkgConfig. Searching manually...")
    
    # Locate Headers
    find_path(MLT_INCLUDE_DIR
        NAMES mlt++/Mlt.h Mlt.h
        PATHS ${MLT_SEARCH_PATH}
        PATH_SUFFIXES include include/mlt-7 include/mlt
    )
    
    # Locate Libraries
    find_library(MLT_LIBRARY
        NAMES mlt-7 mlt
        PATHS ${MLT_SEARCH_PATH}
        PATH_SUFFIXES lib bin
    )
    
    find_library(MLTPP_LIBRARY
        NAMES mlt++-7 mlt++
        PATHS ${MLT_SEARCH_PATH}
        PATH_SUFFIXES lib bin
    )

    if(MLT_INCLUDE_DIR AND MLT_LIBRARY AND MLTPP_LIBRARY)
        set(MLT_FOUND TRUE)
        message(STATUS "Found MLT headers: ${MLT_INCLUDE_DIR}")
        message(STATUS "Found MLT library: ${MLT_LIBRARY}")
        message(STATUS "Found MLT++ library: ${MLTPP_LIBRARY}")
        
        # Create imported target for MLT
        add_library(MLT::mlt UNKNOWN IMPORTED)
        set_target_properties(MLT::mlt PROPERTIES
            IMPORTED_LOCATION "${MLT_LIBRARY}"
            INTERFACE_INCLUDE_DIRECTORIES "${MLT_INCLUDE_DIR}"
        )
        
        # Create imported target for MLT++
        add_library(MLT::mlt++ UNKNOWN IMPORTED)
        set_target_properties(MLT::mlt++ PROPERTIES
            IMPORTED_LOCATION "${MLTPP_LIBRARY}"
            INTERFACE_INCLUDE_DIRECTORIES "${MLT_INCLUDE_DIR}"
            INTERFACE_LINK_LIBRARIES MLT::mlt
        )
        
        set(MLT_LIBRARIES MLT::mlt++)
    else()
        message(WARNING "MLT Framework not automatically found. Please set MLT_SEARCH_PATH or define MLT_INCLUDE_DIR, MLT_LIBRARY, and MLTPP_LIBRARY manually.")
    endif()
else()
    set(MLT_LIBRARIES PkgConfig::MLTPP)
endif()

# Dependency Management: Locate ONNX Runtime & DirectML
set(ONNXRUNTIME_SEARCH_PATH "" CACHE PATH "Custom search path for ONNX Runtime SDK")
set(ONNXRUNTIME_FOUND FALSE)

if(ONNXRUNTIME_SEARCH_PATH)
    find_path(ONNXRUNTIME_INCLUDE_DIR
        NAMES onnxruntime_cxx_api.h
        PATHS ${ONNXRUNTIME_SEARCH_PATH}
        PATH_SUFFIXES include
    )
    find_library(ONNXRUNTIME_LIBRARY
        NAMES onnxruntime
        PATHS ${ONNXRUNTIME_SEARCH_PATH}
        PATH_SUFFIXES lib bin
    )
    if(ONNXRUNTIME_INCLUDE_DIR AND ONNXRUNTIME_LIBRARY)
        set(ONNXRUNTIME_FOUND TRUE)
        message(STATUS "Found ONNX Runtime headers: ${ONNXRUNTIME_INCLUDE_DIR}")
        message(STATUS "Found ONNX Runtime library: ${ONNXRUNTIME_LIBRARY}")
    endif()
endif()

# Engine Core Target
add_library(core-engine STATIC
    src/VideoTimelineManager.cpp
    src/VideoTimelineManager.h
    src/ai_features/AutoSceneDetector.cpp
    src/ai_features/AutoSceneDetector.h
)

target_include_directories(core-engine PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/src>
    $<INSTALL_INTERFACE:include>
)

if(MLT_FOUND)
    target_link_libraries(core-engine PRIVATE ${MLT_LIBRARIES})
    target_compile_definitions(core-engine PRIVATE HAVE_MLT=1)
endif()

if(ONNXRUNTIME_FOUND)
    target_link_libraries(core-engine PRIVATE ${ONNXRUNTIME_LIBRARY})
    target_include_directories(core-engine PRIVATE ${ONNXRUNTIME_INCLUDE_DIR})
    target_compile_definitions(core-engine PRIVATE HAVE_ONNXRUNTIME=1)

    # Search for DirectML library in search path
    find_library(DIRECTML_LIBRARY
        NAMES directml
        PATHS ${ONNXRUNTIME_SEARCH_PATH}
        PATH_SUFFIXES lib
    )
    if(DIRECTML_LIBRARY)
        target_link_libraries(core-engine PRIVATE ${DIRECTML_LIBRARY})
        target_compile_definitions(core-engine PRIVATE HAVE_DIRECTML=1)
        message(STATUS "Found DirectML: ${DIRECTML_LIBRARY}")
    endif()
endif()

# Headless executable for testing
add_executable(engine-test
    src/main.cpp
)

target_link_libraries(engine-test PRIVATE core-engine)

# Install rules
install(TARGETS core-engine engine-test
    EXPORT core-engine-targets
    ARCHIVE DESTINATION lib
    LIBRARY DESTINATION lib
    RUNTIME DESTINATION bin
)
