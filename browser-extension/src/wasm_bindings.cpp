#include <emscripten/bind.h>
#include "VideoTimelineManager.h"

using namespace emscripten;

EMSCRIPTEN_BINDINGS(video_editor_core) {
    // Register std::vector<int> for JS mapping (for auto-cut markers)
    register_vector<int>("IntVector");

    // Bind VideoTimelineManager class
    class_<VideoTimelineManager>("VideoTimelineManager")
        .constructor<std::string>()
        .function("initializeProfile", &VideoTimelineManager::initializeProfile)
        .function("addClip", &VideoTimelineManager::addClip)
        .function("exportFrameToPpm", &VideoTimelineManager::exportFrameToPpm)
        .function("printTimelineInfo", &VideoTimelineManager::printTimelineInfo)
        .function("detectAndApplyAutoCut", &VideoTimelineManager::detectAndApplyAutoCut);
}
