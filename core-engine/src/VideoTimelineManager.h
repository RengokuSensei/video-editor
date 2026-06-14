#pragma once

#include <string>
#include <memory>
#include <vector>

// Forward declarations to keep headers clean and avoid bringing in MLT headers in the public interface.
namespace Mlt {
    class Profile;
    class Tractor;
    class Playlist;
}

class VideoTimelineManager {
public:
    /**
     * @brief Construct a new Video Timeline Manager
     * @param profileName The name of the MLT profile to initialize (e.g., "atsc_1080p_30", "atsc_1080p_60")
     */
    VideoTimelineManager(const std::string& profileName = "atsc_1080p_30");
    
    /**
     * @brief Destroy the Video Timeline Manager
     */
    ~VideoTimelineManager();

    /**
     * @brief Re-initializes the timeline with a different MLT profile.
     * @param profileName The name of the MLT profile.
     * @return true if profile was valid and re-initialization succeeded, false otherwise.
     */
    bool initializeProfile(const std::string& profileName);

    /**
     * @brief Adds a video or generator clip to a specific track index.
     * @param type The MLT producer service type (e.g., "color", "avformat", "noise")
     * @param source The resource path/argument for the producer (e.g., "blue", "video.mp4")
     * @param trackIndex The index of the track to insert into
     * @return true if the clip was successfully added, false otherwise.
     */
    bool addClip(const std::string& type, const std::string& source, int trackIndex);

    /**
     * @brief Inserts a video or generator clip at a specific frame index in the track.
     * @param type The MLT producer service type (e.g., "color", "avformat")
     * @param source The resource path/argument for the producer
     * @param trackIndex The target track index
     * @param startFrame The frame index position where the clip should start
     * @return true if the clip was successfully inserted, false otherwise.
     */
    bool insertClip(const std::string& type, const std::string& source, int trackIndex, int startFrame);

    /**
     * @brief Exports a single frame from the timeline to a PPM (P6) raw image file.
     * @param frameIndex The frame position on the timeline to export (0-indexed)
     * @param outputPath The file path to save the PPM image (e.g., "frame.ppm")
     * @param width The target width to render the frame
     * @param height The target height to render the frame
     * @return true if the frame was successfully rendered and saved, false otherwise.
     */
    bool exportFrameToPpm(int frameIndex, const std::string& outputPath, int width = 1920, int height = 1080);

    /**
     * @brief Prints technical metadata about the profile and timeline state to stdout.
     */
    void printTimelineInfo() const;

    /**
     * @brief Automatically detects scene changes on a given track index, and slices the clips.
     * @param trackIndex The target timeline track (usually 0)
     * @param modelPath Path to the ONNX scene detection model (optional)
     * @return std::vector<int> Frame indices where cuts were applied
     */
    std::vector<int> detectAndApplyAutoCut(int trackIndex, const std::string& modelPath = "");

private:
    std::unique_ptr<Mlt::Profile> m_profile;
    std::unique_ptr<Mlt::Tractor> m_tractor;
    std::unique_ptr<Mlt::Playlist> m_playlist;
    std::string m_lastVideoPath;
};
