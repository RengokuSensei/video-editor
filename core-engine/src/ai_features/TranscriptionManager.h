#pragma once

#include <string>
#include <vector>

struct TranscriptSegment {
    int startFrame;
    int endFrame;
    std::string text;
};

class TranscriptionManager {
public:
    TranscriptionManager();
    ~TranscriptionManager();

    /**
     * @brief Transcribes the audio track of the media file.
     * @param mediaPath The local path to the media file.
     * @param fps The target timeline frames per second.
     * @return A list of transcribed segments with frame boundaries.
     */
    std::vector<TranscriptSegment> transcribeAudio(const std::string& mediaPath, double fps);
};
