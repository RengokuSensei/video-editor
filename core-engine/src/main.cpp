#include "VideoTimelineManager.h"
#include <iostream>

int main() {
    std::cout << "==================================================\n";
    std::cout << "Starting High-Performance headless C++ Media Engine\n";
    std::cout << "==================================================\n\n";

    try {
        // Initialize timeline manager with standard 1080p 30fps profile
        VideoTimelineManager manager("atsc_1080p_30");

        // Add a clip on track 0. We'll use a color generator (solid blue) for headless validation
        // This avoids requiring external media files to pass compile/run validation tests.
        manager.addClip("color", "blue", 0);

        // Print initial timeline data
        manager.printTimelineInfo();

        // Export frame index 0 to PPM file
        std::string export_path = "test_frame.ppm";
        if (manager.exportFrameToPpm(0, export_path, 1920, 1080)) {
            std::cout << "\nSuccess: Frame exported successfully!\n";
        } else {
            std::cerr << "\nError: Frame export failed.\n";
            return 1;
        }

    } catch (const std::exception& e) {
        std::cerr << "\nFatal Exception: " << e.what() << "\n";
        return 1;
    }

    std::cout << "\nEngine execution completed successfully.\n";
    return 0;
}
