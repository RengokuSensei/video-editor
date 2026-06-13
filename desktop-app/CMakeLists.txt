cmake_minimum_required(VERSION 3.16)
project(desktop-app LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Enable automatic compilation helpers for Qt MOC, RCC, and UIC
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

# Find Qt6 libraries
find_package(Qt6 REQUIRED COMPONENTS Core Gui Qml Quick)

# Platform / Architecture Check
if(CMAKE_SYSTEM_PROCESSOR MATCHES "ARM64" OR CMAKE_SYSTEM_PROCESSOR MATCHES "arm64" OR CMAKE_VS_PLATFORM_NAME MATCHES "ARM64")
    message(STATUS "Configuring desktop app for Target Architecture: Windows ARM64")
else()
    message(STATUS "Configuring desktop app for Architecture: ${CMAKE_SYSTEM_PROCESSOR}")
endif()

# Compiler optimization options for Windows ARM64
if(MSVC)
    add_compile_options(
        /O2                 # Optimize for speed
        /Oi                 # Enable intrinsic functions
        /Ot                 # Favor fast code
        /Ob2                # Aggressive inlining
        /Gy                 # Function-level linking
        /GF                 # Eliminate duplicate strings
        /Gw                 # Optimize global data
    )
endif()

# Include core-engine C++ module from the monorepo
add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../core-engine" "${CMAKE_CURRENT_BINARY_DIR}/core-engine-build")

# Executable target definition
add_executable(desktop-app
    src/main.cpp
    src/UI_Engine_Bridge.h
    src/UI_Engine_Bridge.cpp
    src/LogConsoleWidget.h
    src/LogConsoleWidget.cpp
    src/qml.qrc
)

# Link libraries (Qt6 + core-engine)
target_link_libraries(desktop-app PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Qml
    Qt6::Quick
    core-engine
)

# Set runtime output path
set_target_properties(desktop-app PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/bin"
)
