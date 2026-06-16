#pragma once

#include <string>
#include <vector>
#include <cstdint>

class GpuTimelineProcessor {
public:
    GpuTimelineProcessor();
    ~GpuTimelineProcessor();

    /**
     * @brief Initialize OpenCL context and device queues
     * @return true if GPU acceleration initialized successfully, false otherwise.
     */
    bool initOpenCL();

    /**
     * @brief Process color grading (LGG) on a frame buffer using an OpenCL Compute Shader kernel
     * @param frameData Pointer to the raw RGB24 frame data (in/out)
     * @param width Width of the frame
     * @param height Height of the frame
     * @param lift LGG lift value
     * @param gamma LGG gamma value
     * @param gain LGG gain value
     * @return true if successful
     */
    bool applyLggColorGradingGPU(uint8_t* frameData, int width, int height, float lift, float gamma, float gain);

    /**
     * @brief Run color grading using the Zig FFI compiled library fallback
     */
    bool applyLggColorGradingZig(uint8_t* frameData, int width, int height, float lift, float gamma, float gain);

private:
    bool m_openclInitialized;
    void* m_context;     // cl_context
    void* m_device;      // cl_device_id
    void* m_commandQueue;// cl_command_queue
    void* m_program;     // cl_program
    void* m_kernel;      // cl_kernel
};
