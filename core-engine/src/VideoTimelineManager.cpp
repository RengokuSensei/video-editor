#include "VideoTimelineManager.h"
#include "ai_features/AutoSceneDetector.h"
#include "diagnostics/FrameworkLogBridge.h"

#ifdef HAVE_MLT
#include <mlt++/Mlt.h>
#else
#include <iostream>
#include <stdexcept>
#endif

#include <iostream>
#include <fstream>
#include <vector>
#include <stdexcept>

// Conditional compilation block if MLT is not found or linked yet
#ifdef HAVE_MLT

VideoTimelineManager::VideoTimelineManager(const std::string& profileName) {
    // Initialize the MLT factory system (loads plugins, structures, etc.)
    static bool factoryInitialized = false;
    if (!factoryInitialized) {
        if (Mlt::Factory::init() == nullptr) {
            throw std::runtime_error("Fatal: Failed to initialize MLT Factory.");
        }
        factoryInitialized = true;
        diagnostics::registerFrameworkLoggingBridges();
    }

    // Initialize the video profile
    m_profile = std::make_unique<Mlt::Profile>(profileName.c_str());
    if (!m_profile->is_valid()) {
        std::cerr << "[Warning] MLT Profile '" << profileName << "' not found. Falling back to default profile.\n";
        m_profile = std::make_unique<Mlt::Profile>();
    }

    // Create the master multitrack tractor
    m_tractor = std::make_unique<Mlt::Tractor>(*m_profile);

    // Create the primary timeline track playlist
    m_playlist = std::make_unique<Mlt::Playlist>(*m_profile);

    // Link track 0 (playlist) to the multitrack tractor
    m_tractor->multitrack()->connect(*m_playlist, 0);
}

VideoTimelineManager::~VideoTimelineManager() {
    // Managed unique_ptrs clean themselves up automatically.
    // Close the MLT Factory to release active resources.
    Mlt::Factory::close();
}

bool VideoTimelineManager::initializeProfile(const std::string& profileName) {
    auto newProfile = std::make_unique<Mlt::Profile>(profileName.c_str());
    if (newProfile->is_valid()) {
        m_profile = std::move(newProfile);
        
        // Rebuild timeline nodes for the new target profile geometry
        m_tractor = std::make_unique<Mlt::Tractor>(*m_profile);
        m_playlist = std::make_unique<Mlt::Playlist>(*m_profile);
        m_tractor->multitrack()->connect(*m_playlist, 0);
        return true;
    }
    return false;
}

bool VideoTimelineManager::addClip(const std::string& type, const std::string& source, int trackIndex) {
    // Instantiate a Producer representing the video/generator source
    Mlt::Producer producer(*m_profile, type.c_str(), source.c_str());
    if (!producer.is_valid()) {
        std::cerr << "[Error] Failed to load MLT producer service '" << type << "' with resource '" << source << "'.\n";
        return false;
    }

    Mlt::Multitrack* multitrack = m_tractor->multitrack();

    // Dynamically insert missing tracks up to requested index
    while (multitrack->count() <= trackIndex) {
        auto extraPlaylist = new Mlt::Playlist(*m_profile);
        multitrack->connect(*extraPlaylist, multitrack->count());
    }

    // Retrieve target track and append clip
    Mlt::Playlist trackPlaylist(*m_profile);
    trackPlaylist = multitrack->track(trackIndex);
    if (trackPlaylist.append(producer) == 0) {
        std::cout << "[Success] Appended clip (Service: " << type << ", Source: " << source 
                  << ") to Timeline Track " << trackIndex << ".\n";
        return true;
    }

    return false;
}

bool VideoTimelineManager::exportFrameToPpm(int frameIndex, const std::string& outputPath, int width, int height) {
    // Seek timeline position to selected frame
    m_tractor->set("position", frameIndex);

    // Retrieve the frame object
    Mlt::Frame* frame = m_tractor->get_frame(frameIndex);
    if (!frame || !frame->is_valid()) {
        std::cerr << "[Error] Failed to render and extract frame at index " << frameIndex << ".\n";
        delete frame;
        return false;
    }

    // Set target image properties
    mlt_image_format format = mlt_image_rgb24;
    int req_width = width;
    int req_height = height;

    // Get raw RGB frame buffer
    uint8_t* image_buffer = frame->get_image(format, req_width, req_height);
    if (!image_buffer) {
        std::cerr << "[Error] Failed to read frame buffer from memory.\n";
        delete frame;
        return false;
    }

    // Save image to zero-dependency Portable PixMap (PPM P6) binary format
    std::ofstream out(outputPath, std::ios::binary);
    if (!out.is_open()) {
        std::cerr << "[Error] Failed to create destination file: " << outputPath << "\n";
        delete frame;
        return false;
    }

    // Write PPM header
    out << "P6\n" << req_width << " " << req_height << "\n255\n";
    
    // Write RGB raw bytes
    out.write(reinterpret_cast<char*>(image_buffer), req_width * req_height * 3);
    out.close();

    std::cout << "[Success] Saved frame " << frameIndex << " -> " << outputPath 
              << " (" << req_width << "x" << req_height << " RGB24)\n";

    delete frame;
    return true;
}

void VideoTimelineManager::printTimelineInfo() const {
    std::cout << "--- Headless Video Engine Timeline Info ---\n";
    std::cout << "Target Resolution : " << m_profile->width() << "x" << m_profile->height() << "\n";
    std::cout << "Framerate         : " << m_profile->fps() << " fps\n";
    std::cout << "Display Aspect    : " << m_profile->dar() << "\n";
    std::cout << "Track Count       : " << m_tractor->multitrack()->count() << "\n";
    std::cout << "Total Timeline Len: " << m_tractor->get_length() << " frames\n";
    std::cout << "-------------------------------------------\n";
}

std::vector<int> VideoTimelineManager::detectAndApplyAutoCut(int trackIndex, const std::string& modelPath) {
    std::vector<int> allCuts;
    
    Mlt::Multitrack* multitrack = m_tractor->multitrack();
    if (trackIndex < 0 || trackIndex >= multitrack->count()) {
        return allCuts;
    }

    Mlt::Playlist playlist(*m_profile);
    playlist = multitrack->track(trackIndex);
    
    // Instantiate scene detector
    AutoSceneDetector detector(modelPath);
    
    // Loop through all clips in the track's playlist
    for (int c = 0; c < playlist.count(); ++c) {
        Mlt::Producer* clip = playlist.get_clip(c);
        if (clip && clip->is_valid()) {
            std::string resourcePath = clip->get("resource");
            // Only analyze actual video files (skip generator black/blue etc.)
            if (!resourcePath.empty() && resourcePath != "black" && resourcePath != "blue" && resourcePath != "green" && resourcePath != "red") {
                std::vector<int> cuts = detector.detectSceneCuts(resourcePath, 5, 0.85f);
                for (int cutFrame : cuts) {
                    playlist.split(c, cutFrame);
                    allCuts.push_back(cutFrame);
                }
            }
        }
        delete clip;
    }
    return allCuts;
}

#else // Stub implementation if MLT is not linked (ensures headless compilation compiles on any system)

namespace Mlt {
    class Profile {
    public:
        Profile(const char* = nullptr) {}
        bool is_valid() const { return true; }
        int width() const { return 1920; }
        int height() const { return 1080; }
        double fps() const { return 30.0; }
        double dar() const { return 1.7777; }
    };

    class Playlist {
    public:
        Playlist() = default;
        Playlist(const Profile&) {}
        int append(const class Producer&) { return 0; }
    };

    class Multitrack {
    public:
        int count() const { return 1; }
        void connect(Playlist&, int) {}
        Playlist track(int) { return Playlist(); }
    };

    class Tractor {
    public:
        Tractor(const Profile&) {}
        void set(const char*, int) {}
        class Frame* get_frame(int) { return nullptr; }
        int get_length() const { return 0; }
        Multitrack* multitrack() { static Multitrack m; return &m; }
    };

    class Producer {
    public:
        Producer(const Profile&, const char*, const char*) {}
    };
}

VideoTimelineManager::VideoTimelineManager(const std::string& profileName) {
    diagnostics::registerFrameworkLoggingBridges();
    m_profile = std::make_unique<Mlt::Profile>(profileName.c_str());
    m_tractor = std::make_unique<Mlt::Tractor>(*m_profile);
    m_playlist = std::make_unique<Mlt::Playlist>(*m_profile);
    std::cout << "[VideoTimelineManager Mock] Created using profile: " << profileName << "\n";
}

VideoTimelineManager::~VideoTimelineManager() {
    std::cout << "[VideoTimelineManager Mock] Destroyed.\n";
}

bool VideoTimelineManager::initializeProfile(const std::string& profileName) {
    std::cout << "[VideoTimelineManager Mock] Re-initialized profile: " << profileName << "\n";
    return true;
}

bool VideoTimelineManager::addClip(const std::string& type, const std::string& source, int trackIndex) {
    std::cout << "[VideoTimelineManager Mock] Added clip: Type='" << type << "', Source='" 
              << source << "' to track " << trackIndex << "\n";
    return true;
}

bool VideoTimelineManager::exportFrameToPpm(int frameIndex, const std::string& outputPath, int width, int height) {
    std::cout << "[VideoTimelineManager Mock] Exporting Mock Frame " << frameIndex 
              << " to " << outputPath << " (" << width << "x" << height << ")\n";
    
    // Create a mock PPM image (gradient) so the file is actually generated and viewable
    std::ofstream out(outputPath, std::ios::binary);
    if (!out.is_open()) return false;

    out << "P6\n" << width << " " << height << "\n255\n";
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            uint8_t r = static_cast<uint8_t>((x * 255) / width);
            uint8_t g = static_cast<uint8_t>((y * 255) / height);
            uint8_t b = 128; // fixed blue component
            out.put(r);
            out.put(g);
            out.put(b);
        }
    }
    out.close();
    std::cout << "[VideoTimelineManager Mock] Generated mock gradient PPM at " << outputPath << "\n";
    return true;
}

void VideoTimelineManager::printTimelineInfo() const {
    std::cout << "--- [VideoTimelineManager Mock Info] ---\n";
    std::cout << "Target Resolution : 1920x1080 (Mock)\n";
    std::cout << "Framerate         : 30 fps (Mock)\n";
    std::cout << "Track Count       : 1 (Mock)\n";
    std::cout << "----------------------------------------\n";
}

std::vector<int> VideoTimelineManager::detectAndApplyAutoCut(int trackIndex, const std::string& modelPath) {
    std::cout << "[VideoTimelineManager Mock] Running Auto-Cut on track " << trackIndex << "...\n";
    AutoSceneDetector detector(modelPath);
    
    // Simulate cut points
    std::vector<int> cuts = detector.detectSceneCuts("mock_timeline_file.mp4", 5, 0.85f);
    
    std::cout << "[VideoTimelineManager Mock] Auto-Cut completed. Slicing simulated timeline tracks at frame index offsets: ";
    for (int cut : cuts) {
        std::cout << cut << " ";
    }
    std::cout << "\n";
    
    return cuts;
}

#endif
