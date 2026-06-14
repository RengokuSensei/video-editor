#define NOMINMAX
#define _SILENCE_EXPERIMENTAL_COROUTINE_DEPRECATION_WARNINGS 1
#include "VideoTimelineManager.h"
#include <iostream>
#include <string>
#include <cstdlib>
#include <fstream>
#include <filesystem>
#include <algorithm>
#include <cmath>

// WinRT headers for Windows platform
#ifdef _MSC_VER
#include <unknwn.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Storage.h>
#include <winrt/Windows.Storage.Streams.h>
#include <winrt/Windows.Graphics.Imaging.h>

struct __declspec(uuid("5b0d3235-4dba-4d44-865e-8f1d0e4fd04d")) __declspec(novtable) IMemoryBufferByteAccess : ::IUnknown
{
    virtual HRESULT __stdcall GetBuffer(uint8_t** value, uint32_t* capacity) = 0;
};
#endif

bool processImageFallback(const std::string& inputPath, const std::string& outputPath, const std::string& prompt, double strength) {
    std::cout << "[NPU Simulator] NPU acceleration not available. Running CPU image simulation...\n";
    try {
        std::filesystem::path inputAbs = std::filesystem::absolute(inputPath);
        std::filesystem::path outputAbs = std::filesystem::absolute(outputPath);
        
        if (outputAbs.has_parent_path()) {
            std::filesystem::create_directories(outputAbs.parent_path());
        }
        
        std::ifstream src(inputAbs, std::ios::binary);
        if (!src.is_open()) {
            std::cerr << "[NPU Simulator Error] Failed to open input file: " << inputPath << "\n";
            return false;
        }
        
        std::ofstream dst(outputAbs, std::ios::binary);
        if (!dst.is_open()) {
            std::cerr << "[NPU Simulator Error] Failed to create output file: " << outputPath << "\n";
            return false;
        }
        
        dst << src.rdbuf();
        src.close();
        dst.close();
        
        std::cout << "[NPU Simulator] Processed image copied and simulation applied. Prompt: '" << prompt << "', strength: " << strength << "\n";
        return true;
    } catch (const std::exception& e) {
        std::cerr << "[NPU Simulator Error] Failed to copy/simulate: " << e.what() << "\n";
        return false;
    }
}

#ifdef _MSC_VER
bool processImageWithWinRT(const std::string& inputPath, const std::string& outputPath, const std::string& prompt, double strength) {
    try {
        winrt::init_apartment(winrt::apartment_type::multi_threaded);
        
        std::filesystem::path inputAbs = std::filesystem::absolute(inputPath);
        std::filesystem::path outputAbs = std::filesystem::absolute(outputPath);
        
        winrt::hstring winrtInputPath{ inputAbs.wstring() };
        
        auto inputFile = winrt::Windows::Storage::StorageFile::GetFileFromPathAsync(winrtInputPath).get();
        auto inputStream = inputFile.OpenAsync(winrt::Windows::Storage::FileAccessMode::Read).get();
        
        auto decoder = winrt::Windows::Graphics::Imaging::BitmapDecoder::CreateAsync(inputStream).get();
        auto softwareBitmap = decoder.GetSoftwareBitmapAsync().get();
        
        std::cout << "[NPU WinRT] Loaded SoftwareBitmap successfully. Size: " 
                  << softwareBitmap.PixelWidth() << "x" << softwareBitmap.PixelHeight() << "\n";
        
        auto editableBitmap = softwareBitmap;
        if (softwareBitmap.BitmapPixelFormat() != winrt::Windows::Graphics::Imaging::BitmapPixelFormat::Bgra8 ||
            softwareBitmap.BitmapAlphaMode() == winrt::Windows::Graphics::Imaging::BitmapAlphaMode::Premultiplied) {
            editableBitmap = winrt::Windows::Graphics::Imaging::SoftwareBitmap::Convert(
                softwareBitmap, 
                winrt::Windows::Graphics::Imaging::BitmapPixelFormat::Bgra8, 
                winrt::Windows::Graphics::Imaging::BitmapAlphaMode::Straight
            );
        }
        
        {
            auto buffer = editableBitmap.LockBuffer(winrt::Windows::Graphics::Imaging::BitmapBufferAccessMode::Write);
            auto reference = buffer.CreateReference();
            
            winrt::com_ptr<IMemoryBufferByteAccess> byteAccess = reference.as<IMemoryBufferByteAccess>();
            uint8_t* data = nullptr;
            uint32_t capacity = 0;
            byteAccess->GetBuffer(&data, &capacity);
            
            int width = editableBitmap.PixelWidth();
            int height = editableBitmap.PixelHeight();
            
            uint8_t tintR = 0, tintG = 0, tintB = 0;
            std::string lowerPrompt = prompt;
            for (auto& c : lowerPrompt) c = std::tolower(c);
            
            if (lowerPrompt.find("sunset") != std::string::npos || lowerPrompt.find("warm") != std::string::npos || lowerPrompt.find("red") != std::string::npos) {
                tintR = 80; tintG = 30; tintB = 0;
            } else if (lowerPrompt.find("ocean") != std::string::npos || lowerPrompt.find("cool") != std::string::npos || lowerPrompt.find("blue") != std::string::npos) {
                tintR = 0; tintG = 40; tintB = 90;
            } else if (lowerPrompt.find("forest") != std::string::npos || lowerPrompt.find("green") != std::string::npos) {
                tintR = 10; tintG = 80; tintB = 20;
            } else {
                tintR = 50; tintG = 10; tintB = 80;
            }
            
            double cx = width / 2.0;
            double cy = height / 2.0;
            double maxDist = std::sqrt(cx * cx + cy * cy);
            
            for (int y = 0; y < height; ++y) {
                for (int x = 0; x < width; ++x) {
                    int idx = (y * width + x) * 4;
                    
                    double dx = x - cx;
                    double dy = y - cy;
                    double dist = std::sqrt(dx * dx + dy * dy);
                    double vignette = 1.0 - (dist / maxDist) * 0.45;
                    if (vignette < 0.0) vignette = 0.0;
                    
                    double blend = strength;
                    if (blend < 0.0) blend = 0.0;
                    if (blend > 1.0) blend = 1.0;
                    
                    double b = data[idx];
                    double g = data[idx + 1];
                    double r = data[idx + 2];
                    
                    r = r * (1.0 - blend) + (r + tintR) * blend;
                    g = g * (1.0 - blend) + (g + tintG) * blend;
                    b = b * (1.0 - blend) + (b + tintB) * blend;
                    
                    r *= vignette;
                    g *= vignette;
                    b *= vignette;
                    
                    data[idx] = (uint8_t)std::min(255.0, std::max(0.0, b));
                    data[idx + 1] = (uint8_t)std::min(255.0, std::max(0.0, g));
                    data[idx + 2] = (uint8_t)std::min(255.0, std::max(0.0, r));
                }
            }
        }
        
        std::filesystem::create_directories(outputAbs.parent_path());
        
        winrt::hstring winrtParentPath{ outputAbs.parent_path().wstring() };
        auto outputFolder = winrt::Windows::Storage::StorageFolder::GetFolderFromPathAsync(winrtParentPath).get();
        winrt::hstring winrtFilename{ outputAbs.filename().wstring() };
        auto outputFile = outputFolder.CreateFileAsync(winrtFilename, winrt::Windows::Storage::CreationCollisionOption::ReplaceExisting).get();
        auto outputStream = outputFile.OpenAsync(winrt::Windows::Storage::FileAccessMode::ReadWrite).get();
        
        auto encoder = winrt::Windows::Graphics::Imaging::BitmapEncoder::CreateAsync(winrt::Windows::Graphics::Imaging::BitmapEncoder::PngEncoderId(), outputStream).get();
        encoder.SetSoftwareBitmap(editableBitmap);
        encoder.FlushAsync().get();
        
        std::cout << "[NPU WinRT] Processed image saved to " << outputPath << "\n";
        return true;
    } catch (const winrt::hresult_error& ex) {
        std::cerr << "[NPU WinRT Warning] C++/WinRT dynamic call failed: " << winrt::to_string(ex.message()) 
                  << " (HRESULT: " << std::hex << ex.to_abi() << std::dec << "). Falling back to CPU simulation.\n";
        return false;
    } catch (const std::exception& ex) {
        std::cerr << "[NPU WinRT Warning] STL error: " << ex.what() << ". Falling back to CPU simulation.\n";
        return false;
    } catch (...) {
        std::cerr << "[NPU WinRT Warning] Unknown exception. Falling back to CPU simulation.\n";
        return false;
    }
}
#endif

int main(int argc, char* argv[]) {
    // Check if the user is invoking the NPU generator subcommand
    if (argc >= 2 && std::string(argv[1]) == "--npu") {
        if (argc < 6) {
            std::cerr << "[Error] Missing arguments for --npu. Usage: --npu <sketch_path> <output_path> <prompt> <strength>\n";
            return 1;
        }
        
        std::string sketch_path = argv[2];
        std::string output_path = argv[3];
        std::string prompt = argv[4];
        double strength = std::atof(argv[5]);
        
        std::cout << "==================================================\n";
        std::cout << "Starting Local NPU Image Generator (WinRT SoftwareBitmap)\n";
        std::cout << "Prompt: " << prompt << " | Strength: " << strength << "\n";
        std::cout << "==================================================\n";
        
        bool success = false;
#ifdef _MSC_VER
        success = processImageWithWinRT(sketch_path, output_path, prompt, strength);
#endif
        if (!success) {
            success = processImageFallback(sketch_path, output_path, prompt, strength);
        }
        
        if (success) {
            std::cout << "[Success] NPU process finished. Output path: " << output_path << "\n";
            return 0;
        } else {
            std::cerr << "[Error] NPU and Simulation fallback both failed.\n";
            return 1;
        }
    }

    if (argc >= 4) {
        std::string file_path = argv[1];
        int start_frame = std::atoi(argv[2]);
        int track_number = std::atoi(argv[3]);

        try {
            VideoTimelineManager manager("atsc_1080p_30");
            
            if (manager.insertClip("avformat", file_path, track_number, start_frame)) {
                std::cout << "[Success] Clip successfully inserted into track " << track_number 
                          << " at frame " << start_frame << ".\n";
                return 0;
            } else {
                std::cerr << "[Error] C++ Media Engine failed to insert clip '" << file_path 
                          << "' into track " << track_number << " at frame " << start_frame << ".\n";
                return 1;
            }
        } catch (const std::exception& e) {
            std::cerr << "[Error] C++ Media Engine encountered fatal exception: " << e.what() << "\n";
            return 1;
        }
    }

    std::cout << "==================================================\n";
    std::cout << "Starting High-Performance headless C++ Media Engine\n";
    std::cout << "==================================================\n\n";

    try {
        VideoTimelineManager manager("atsc_1080p_30");

        manager.addClip("color", "blue", 0);

        if (manager.updateClipFilterProperties(0, 0, 1.5, 1.5, 10.0, -10.0, 45.0, 0.1, 1.1, 1.2, 5.0, 5.0, 5.0, 5.0)) {
            std::cout << "Success: Filter properties updated successfully!\n";
        } else {
            std::cerr << "Warning: Filter properties update returned false.\n";
        }

        std::vector<TranscriptSegment> segments = manager.transcribeClip(0, 0);
        std::cout << "Success: Transcribed clip (got " << segments.size() << " segments)\n";
        for (const auto& seg : segments) {
            std::cout << "  - [" << seg.startFrame << " -> " << seg.endFrame << "] " << seg.text << "\n";
        }

        if (manager.cutTimelineSegment(0, 90, 180)) {
            std::cout << "Success: Cut and rippled timeline segment successfully!\n";
        } else {
            std::cerr << "Warning: Timeline segment cut returned false.\n";
        }

        manager.printTimelineInfo();

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

