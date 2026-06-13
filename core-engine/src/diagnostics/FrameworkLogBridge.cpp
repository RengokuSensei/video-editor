#include "diagnostics/FrameworkLogBridge.h"
#include "diagnostics/Logger.h"
#include <iostream>
#include <cstdarg>
#include <vector>

#ifdef HAVE_MLT
#include <framework/mlt.h>
#endif

#ifdef HAVE_FFMPEG
extern "C" {
#include <libavutil/log.h>
}
#endif

namespace diagnostics {

#ifdef HAVE_MLT
static void mlt_log_callback_bridge(void* service, int mlt_level, const char* format, va_list args) {
    // 1. Map MLT level to custom Logger level
    Logger::LogLevel level = Logger::LogLevel::INFO;
    switch (mlt_level) {
        case MLT_LOG_DEBUG:
            level = Logger::LogLevel::DEBUG;
            break;
        case MLT_LOG_VERBOSE:
            level = Logger::LogLevel::TRACE;
            break;
        case MLT_LOG_INFO:
            level = Logger::LogLevel::INFO;
            break;
        case MLT_LOG_WARNING:
            level = Logger::LogLevel::WARNING;
            break;
        case MLT_LOG_ERROR:
            level = Logger::LogLevel::ERROR;
            break;
        case MLT_LOG_FATAL:
        case MLT_LOG_PANIC:
            level = Logger::LogLevel::CRITICAL;
            break;
        default:
            level = Logger::LogLevel::INFO;
            break;
    }

    // 2. Extract service / module name to construct tag
    std::string tag = "MLT";
    mlt_properties properties = service ? MLT_SERVICE_PROPERTIES((mlt_service)service) : nullptr;
    if (properties) {
        char* mlt_type = mlt_properties_get(properties, "mlt_type");
        char* service_name = mlt_properties_get(properties, "mlt_service");
        if (service_name) {
            tag += ":";
            tag += service_name;
        } else if (mlt_type) {
            tag += ":";
            tag += mlt_type;
        }
    }

    // 3. Format message contents
    va_list args_copy;
    va_copy(args_copy, args);
    int size = vsnprintf(nullptr, 0, format, args_copy);
    va_end(args_copy);

    std::string raw_message;
    if (size > 0) {
        std::vector<char> buf(size + 1);
        vsnprintf(buf.data(), buf.size(), format, args);
        raw_message = std::string(buf.data(), size);
    }

    // Strip trailing newlines
    while (!raw_message.empty() && (raw_message.back() == '\n' || raw_message.back() == '\r')) {
        raw_message.pop_back();
    }

    if (raw_message.empty()) {
        return;
    }

    // Forward formatted tag and message into C++ Logger
    Logger::getInstance().log(level, tag.c_str(), 0, "%s", raw_message.c_str());
}
#endif

#ifdef HAVE_FFMPEG
static void ffmpeg_log_callback_bridge(void* ptr, int av_level, const char* format, va_list vl) {
    // 1. Map FFmpeg level to custom Logger level
    Logger::LogLevel level = Logger::LogLevel::INFO;
    if (av_level <= AV_LOG_FATAL) {
        level = Logger::LogLevel::CRITICAL;
    } else if (av_level <= AV_LOG_ERROR) {
        level = Logger::LogLevel::ERROR;
    } else if (av_level <= AV_LOG_WARNING) {
        level = Logger::LogLevel::WARNING;
    } else if (av_level <= AV_LOG_INFO) {
        level = Logger::LogLevel::INFO;
    } else if (av_level <= AV_LOG_DEBUG) {
        level = Logger::LogLevel::DEBUG;
    } else {
        level = Logger::LogLevel::TRACE;
    }

    // 2. Extract original component tags (e.g. h264_qsv)
    std::string tag = "FFmpeg";
    if (ptr) {
        AVClass* avc = *(AVClass**)ptr;
        if (avc) {
            if (avc->item_name) {
                const char* name = avc->item_name(ptr);
                if (name) {
                    tag += ":";
                    tag += name;
                }
            } else if (avc->class_name) {
                tag += ":";
                tag += avc->class_name;
            }
        }
    }

    // 3. Format message contents
    va_list args_copy;
    va_copy(args_copy, vl);
    int size = vsnprintf(nullptr, 0, format, args_copy);
    va_end(args_copy);

    std::string raw_message;
    if (size > 0) {
        std::vector<char> buf(size + 1);
        vsnprintf(buf.data(), buf.size(), format, vl);
        raw_message = std::string(buf.data(), size);
    }

    // Strip trailing newlines
    while (!raw_message.empty() && (raw_message.back() == '\n' || raw_message.back() == '\r')) {
        raw_message.pop_back();
    }

    if (raw_message.empty()) {
        return;
    }

    // Forward formatted tag and message into C++ Logger
    Logger::getInstance().log(level, tag.c_str(), 0, "%s", raw_message.c_str());
}
#endif

void registerFrameworkLoggingBridges() {
#ifdef HAVE_MLT
    mlt_log_set_callback(mlt_log_callback_bridge);
#endif

#ifdef HAVE_FFMPEG
    av_log_set_callback(ffmpeg_log_callback_bridge);
#endif
}

} // namespace diagnostics
