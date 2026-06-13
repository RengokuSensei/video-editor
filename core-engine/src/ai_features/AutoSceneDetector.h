#pragma once

#include <string>
#include <vector>
#include <memory>

class AutoSceneDetector {
public:
    /**
     * @brief Construct an Auto Scene Detector
     * @param modelPath Path to the ONNX scene detection model
     */
    AutoSceneDetector(const std::string& modelPath = "");

    /**
     * @brief Destroy the Auto Scene Detector
     */
    ~AutoSceneDetector();

    /**
     * @brief Runs inference or fallback analysis to detect harsh scene cuts in a video.
     * @param videoPath Absolute filepath to the video
     * @param frameInterval Frame interval to skip (e.g. 5 means check every 5th frame)
     * @param threshold Confidence threshold (0.0 to 1.0) above which a cut is registered
     * @return std::vector<int> List of frame indices where scene changes/cuts were detected
     */
    std::vector<int> detectSceneCuts(const std::string& videoPath, int frameInterval = 5, float threshold = 0.85f);

private:
    std::string m_modelPath;

#ifdef HAVE_ONNXRUNTIME
    struct Impl;
    std::unique_ptr<Impl> m_impl;
#endif

    /**
     * @brief Zero-dependency pixel difference fallback.
     * @return std::vector<int> list of cut frames
     */
    std::vector<int> detectSceneCutsFallback(const std::string& videoPath, int frameInterval, float threshold);
};
