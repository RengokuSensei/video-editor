#include "AutoSceneDetector.h"
#include <iostream>
#include <fstream>
#include <cmath>
#include <algorithm>
#include <chrono>

#ifdef HAVE_ONNXRUNTIME
#include <onnxruntime_cxx_api.h>
#ifdef HAVE_DIRECTML
#include <dml_provider_factory.h>
#endif

// Private implementation wrapper to keep ONNX headers out of the main class header
struct AutoSceneDetector::Impl {
    Ort::Env env;
    Ort::SessionOptions sessionOptions;
    std::unique_ptr<Ort::Session> session;
    
    std::vector<std::string> inputNames;
    std::vector<std::string> outputNames;

    Impl() : env(ORT_LOGGING_LEVEL_WARNING, "AutoSceneDetector") {}
};
#endif

#ifdef HAVE_MLT
#include <mlt++/Mlt.h>
#endif

AutoSceneDetector::AutoSceneDetector(const std::string& modelPath)
    : m_modelPath(modelPath)
{
#ifdef HAVE_ONNXRUNTIME
    if (!m_modelPath.empty()) {
        try {
            m_impl = std::make_unique<Impl>();
            
            // 1. Enable DirectML Execution Provider for Windows NPU/GPU acceleration
#ifdef HAVE_DIRECTML
            std::cout << "[AI Core] DirectML Hardware Acceleration enabled.\n";
            // Index 0 represents the primary NPU/GPU device
            OrtSessionOptionsAppendExecutionProvider_DML(m_impl->sessionOptions, 0);
#else
            std::cout << "[AI Core] DirectML not available. Falling back to CPU execution.\n";
#endif
            // Optimize thread usage
            m_impl->sessionOptions.SetIntraOpNumThreads(2);
            m_impl->sessionOptions.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);

            // 2. Load the ONNX model session
            std::wstring modelPathW(m_modelPath.begin(), m_modelPath.end());
            m_impl->session = std::make_unique<Ort::Session>(
                m_impl->env, 
                modelPathW.c_str(), 
                m_impl->sessionOptions
            );

            // Fetch input/output count and details (usually 1 input, 1 output for classifiers)
            Ort::AllocatorWithDefaultOptions allocator;
            size_t numInputNodes = m_impl->session->GetInputCount();
            for (size_t i = 0; i < numInputNodes; ++i) {
                auto inputName = m_impl->session->GetInputNameAllocated(i, allocator);
                m_impl->inputNames.push_back(inputName.get());
            }

            size_t numOutputNodes = m_impl->session->GetOutputCount();
            for (size_t i = 0; i < numOutputNodes; ++i) {
                auto outputName = m_impl->session->GetOutputNameAllocated(i, allocator);
                m_impl->outputNames.push_back(outputName.get());
            }

            std::cout << "[AI Core] ONNX Session successfully created. Model inputs: " 
                      << m_impl->inputNames.size() << " | Outputs: " << m_impl->outputNames.size() << "\n";

        } catch (const std::exception& e) {
            std::cerr << "[AI Core Error] Failed to load ONNX session: " << e.what() << "\n";
            m_impl.reset(); // Fall back to CPU/pixel thresholding
        }
    }
#endif
}

AutoSceneDetector::~AutoSceneDetector() = default;

std::vector<int> AutoSceneDetector::detectSceneCuts(const std::string& videoPath, int frameInterval, float threshold) {
    std::cout << "[AI Core] Starting scene cut analysis for: " << videoPath << "\n";
    
    auto startTime = std::chrono::high_resolution_clock::now();

#ifdef HAVE_ONNXRUNTIME
    // If ONNX Runtime is enabled, initialized, and model was provided
    if (m_impl && m_impl->session) {
        std::vector<int> cuts;
        
        // Setup mock logic inside ORT loop. Real scene cut models evaluate temporal difference
        // by comparing features of consecutive frames.
        // e.g. input_tensor dimensions: [1, 3, 224, 224] for ResNet/MobileNet features
        
        // Pull frames using MLT frame buffers
#ifdef HAVE_MLT
        Mlt::Profile profile;
        Mlt::Producer producer(profile, "avformat", videoPath.c_str());
        if (producer.is_valid()) {
            int length = producer.get_length();
            mlt_image_format format = mlt_image_rgb24;
            int width = 224;
            int height = 224;
            
            std::vector<float> inputValues(1 * 3 * 224 * 224, 0.0f);
            
            // Loop through frames
            for (int i = frameInterval; i < length; i += frameInterval) {
                Mlt::Frame* frame = producer.get_frame(i);
                if (frame && frame->is_valid()) {
                    uint8_t* buffer = frame->get_image(format, width, height);
                    if (buffer) {
                        // Preprocess raw RGB24 buffer into planar floats [0.0, 1.0] for ONNX tensor
                        // Dimensions: [batch=1, channels=3, height=224, width=224]
                        for (int c = 0; c < 3; ++c) {
                            for (int y = 0; y < 224; ++y) {
                                for (int x = 0; x < 224; ++x) {
                                    int pixelIdx = (y * 224 + x) * 3 + c;
                                    int tensorIdx = c * (224 * 224) + (y * 224 + x);
                                    inputValues[tensorIdx] = static_cast<float>(buffer[pixelIdx]) / 255.0f;
                                }
                            }
                        }

                        // Define tensor shape
                        std::vector<int64_t> inputShape = {1, 3, 224, 224};
                        auto memoryInfo = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
                        
                        Ort::Value inputTensor = Ort::Value::CreateTensor<float>(
                            memoryInfo, 
                            inputValues.data(), 
                            inputValues.size(), 
                            inputShape.data(), 
                            inputShape.size()
                        );

                        // Run ONNX Session ( DirectML accelerates this )
                        const char* inputNamePtr = m_impl->inputNames[0].c_str();
                        const char* outputNamePtr = m_impl->outputNames[0].c_str();
                        
                        auto outputTensors = m_impl->session->Run(
                            Ort::RunOptions{nullptr}, 
                            &inputNamePtr, 
                            &inputTensor, 
                            1, 
                            &outputNamePtr, 
                            1
                        );

                        // Extract model probability
                        float* outputArr = outputTensors[0].GetTensorMutableData<float>();
                        float cutProbability = outputArr[0]; // Cut probability score [0.0 - 1.0]

                        if (cutProbability >= threshold) {
                            cuts.push_back(i);
                            std::cout << "[AI Core] Scene change detected via ONNX model at frame: " << i 
                                      << " (Conf: " << cutProbability << ")\n";
                        }
                    }
                    delete frame; // Safely release MLT frame allocation
                }
            }
            
            auto endTime = std::chrono::high_resolution_clock::now();
            auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime).count();
            std::cout << "[AI Core] ONNX analysis completed in " << duration << " ms. Found " 
                      << cuts.size() << " cuts.\n";
            return cuts;
        }
#endif // HAVE_MLT
    }
#endif // HAVE_ONNXRUNTIME

    // Fall back if ONNX Runtime is not compiled or session failed
    return detectSceneCutsFallback(videoPath, frameInterval, threshold);
}

std::vector<int> AutoSceneDetector::detectSceneCutsFallback(const std::string& videoPath, int frameInterval, float threshold) {
    std::cout << "[AI Core] Running fallback algorithmic scene cut detector...\n";
    std::vector<int> cuts;

#ifdef HAVE_MLT
    // If MLT is compiled, calculate mean pixel differences between frames
    Mlt::Profile profile;
    Mlt::Producer producer(profile, "avformat", videoPath.c_str());
    if (producer.is_valid()) {
        int length = producer.get_length();
        mlt_image_format format = mlt_image_rgb24;
        
        // Low-resolution extraction for high-speed analysis
        int width = 64; 
        int height = 36;
        size_t bufferSize = width * height * 3;
        
        std::vector<uint8_t> prevBuffer(bufferSize, 0);
        bool hasPrev = false;

        // Iterate through frames
        for (int i = 0; i < length; i += frameInterval) {
            Mlt::Frame* frame = producer.get_frame(i);
            if (frame && frame->is_valid()) {
                uint8_t* buffer = frame->get_image(format, width, height);
                if (buffer) {
                    if (hasPrev) {
                        // Compute mean absolute difference (MAD)
                        double diffAccumulator = 0.0;
                        for (size_t k = 0; k < bufferSize; ++k) {
                            diffAccumulator += std::abs(static_cast<int>(buffer[k]) - static_cast<int>(prevBuffer[k]));
                        }
                        
                        double meanDiff = diffAccumulator / bufferSize;
                        
                        // A threshold of 35-40 represents a significant visual change in pixel average
                        double triggerLimit = threshold * 45.0; 
                        
                        if (meanDiff > triggerLimit) {
                            cuts.push_back(i);
                            std::cout << "[AI Core] Scene change detected via pixel delta at frame: " << i 
                                      << " (Delta: " << meanDiff << ")\n";
                        }
                    }
                    
                    // Cache buffer for next evaluation
                    std::copy(buffer, buffer + bufferSize, prevBuffer.begin());
                    hasPrev = true;
                }
                delete frame; // Safely release MLT frame
            }
        }
        std::cout << "[AI Core] Fallback pixel analysis completed. Found " << cuts.size() << " cuts.\n";
        return cuts;
    }
#else
    // If pure mock mode (no MLT or ONNX linked), simulate cut frames deterministically
    // based on the filename to give instantaneous UI layout updates.
    size_t seed = videoPath.length();
    int simulatedLen = 300; // Mock video length of 10 seconds (300 frames)
    
    // Generate cuts at 2-3 standard points
    int cut1 = 60 + static_cast<int>(seed % 20);
    int cut2 = 150 + static_cast<int>((seed * 7) % 30);
    int cut3 = 240 - static_cast<int>((seed * 3) % 20);
    
    cuts.push_back(cut1);
    cuts.push_back(cut2);
    cuts.push_back(cut3);
    
    std::cout << "[AI Core Mock] Simulated scene changes registered at frames: " 
              << cut1 << ", " << cut2 << ", " << cut3 << "\n";
#endif

    return cuts;
}
