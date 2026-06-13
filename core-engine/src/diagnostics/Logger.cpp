#include "diagnostics/Logger.h"
#include <cstdarg>
#include <vector>
#include <iostream>
#include <sstream>
#include <chrono>
#include <iomanip>
#include <filesystem>
#include <algorithm>

namespace diagnostics {

Logger& Logger::getInstance() {
    static Logger instance;
    return instance;
}

Logger::Logger() 
    : m_mode(LogMode::Sync)
    , m_maxFileSize(10 * 1024 * 1024)
    , m_maxBackupFiles(5)
    , m_shutdown(false)
    , m_callback(nullptr) {
    // Default initial configuration
    configure("app.log", LogMode::Sync);
}

Logger::~Logger() {
    shutdownWorker();
    std::lock_guard<std::mutex> lock(m_logMutex);
    if (m_fileStream.is_open()) {
        m_fileStream.close();
    }
}

void Logger::configure(const std::string& filepath, LogMode mode, size_t maxFileSize, size_t maxBackupFiles) {
    // Prevent reconfiguration while other logs might be occurring
    std::lock_guard<std::mutex> lock(m_logMutex);
    
    // Shut down worker thread if running
    shutdownWorker();
    
    if (m_fileStream.is_open()) {
        m_fileStream.close();
    }
    
    m_filepath = filepath;
    m_mode = mode;
    m_maxFileSize = maxFileSize;
    m_maxBackupFiles = maxBackupFiles;
    
    openLogFile();
    
    if (m_mode == LogMode::Async) {
        m_shutdown = false;
        m_workerThread = std::thread(&Logger::workerLoop, this);
    }
}

void Logger::setCallback(LogCallback callback) {
    std::lock_guard<std::mutex> lock(m_logMutex);
    m_callback = callback;
}

void Logger::log(LogLevel level, const char* filename, int line, const char* format, ...) {
    va_list args;
    va_start(args, format);
    
    // Estimate size first
    va_list args_copy;
    va_copy(args_copy, args);
    int size = vsnprintf(nullptr, 0, format, args_copy);
    va_end(args_copy);
    
    std::string message;
    if (size > 0) {
        std::vector<char> buf(size + 1);
        vsnprintf(buf.data(), buf.size(), format, args);
        message = std::string(buf.data(), size);
    }
    va_end(args);
    
    writeLogEntry(level, filename, line, message);
}

void Logger::flush() {
    if (m_mode == LogMode::Async) {
        // Sleep-wait loop until queue is empty
        while (true) {
            {
                std::lock_guard<std::mutex> lock(m_queueMutex);
                if (m_queue.empty()) {
                    break;
                }
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
    }
    
    std::lock_guard<std::mutex> lock(m_logMutex);
    if (m_fileStream.is_open()) {
        m_fileStream.flush();
    }
}

void Logger::openLogFile() {
    std::filesystem::path parentDir = std::filesystem::path(m_filepath).parent_path();
    if (!parentDir.empty() && !std::filesystem::exists(parentDir)) {
        std::filesystem::create_directories(parentDir);
    }
    
    m_fileStream.open(m_filepath, std::ios::out | std::ios::app | std::ios::binary);
    if (!m_fileStream.is_open()) {
        std::cerr << "[Logger Error] Failed to open log file: " << m_filepath << "\n";
    }
}

void Logger::writeLogEntry(LogLevel level, const char* filename, int line, const std::string& message) {
    // 1. Generate timestamp with millisecond accuracy
    auto now = std::chrono::system_clock::now();
    auto time_t_now = std::chrono::system_clock::to_time_t(now);
    auto duration = now.time_since_epoch();
    auto millis = std::chrono::duration_cast<std::chrono::milliseconds>(duration).count() % 1000;
    
    std::tm tm_buf;
#ifdef _WIN32
    localtime_s(&tm_buf, &time_t_now);
#else
    localtime_r(&time_t_now, &tm_buf);
#endif

    std::ostringstream ss;
    ss << std::put_time(&tm_buf, "%Y-%m-%d %H:%M:%S") << '.' 
       << std::setfill('0') << std::setw(3) << millis;
    std::string timestamp = ss.str();
    
    // 2. Format log level string
    const char* level_str = "INF";
    switch (level) {
        case LogLevel::TRACE:    level_str = "TRC"; break;
        case LogLevel::DEBUG:    level_str = "DBG"; break;
        case LogLevel::INFO:     level_str = "INF"; break;
        case LogLevel::WARNING:  level_str = "WRN"; break;
        case LogLevel::ERROR:    level_str = "ERR"; break;
        case LogLevel::CRITICAL: level_str = "CRT"; break;
    }
    
    // 3. Thread ID formatting
    std::ostringstream thread_ss;
    thread_ss << std::this_thread::get_id();
    std::string thread_id = thread_ss.str();
    
    // 4. File name extraction
    std::string file_str(filename);
    size_t last_slash = file_str.find_last_of("\\/");
    std::string basename = (last_slash == std::string::npos) ? file_str : file_str.substr(last_slash + 1);
    
    // 5. Final string construction
    // [YYYY-MM-DD HH:MM:SS.mmm] [LEVEL] [Thread-ID] [File:Line] message
    std::ostringstream log_ss;
    log_ss << "[" << timestamp << "] [" << level_str << "] [" << thread_id << "] [" 
           << basename << ":" << line << "] " << message << "\n";
    
    std::string entry = log_ss.str();
    
    // 6. Handle sync vs async routing
    if (m_mode == LogMode::Async) {
        {
            std::lock_guard<std::mutex> lock(m_queueMutex);
            m_queue.push({level, std::move(entry)});
        }
        m_cv.notify_one();
    } else {
        writeEntryToDisk(level, entry);
    }
}

void Logger::writeEntryToDisk(LogLevel level, const std::string& entry) {
    // Synchronize disk writing
    std::lock_guard<std::mutex> lock(m_logMutex);
    
    if (m_fileStream.is_open()) {
        m_fileStream.write(entry.data(), entry.size());
        m_fileStream.flush();
        checkRotation();
    } else {
        // Fallback to stderr if stream is unavailable
        std::cerr << entry;
    }

    if (m_callback) {
        m_callback(level, entry.c_str());
    }
}

void Logger::checkRotation() {
    if (!m_fileStream.is_open()) return;
    
    // Query stream position for current file size
    std::streampos pos = m_fileStream.tellp();
    if (pos >= static_cast<std::streamoff>(m_maxFileSize)) {
        m_fileStream.close();
        
        // Generate timestamp for backup rename (e.g. app_old_20260613_153022.log)
        auto now = std::chrono::system_clock::now();
        auto time_t_now = std::chrono::system_clock::to_time_t(now);
        std::tm tm_buf;
#ifdef _WIN32
        localtime_s(&tm_buf, &time_t_now);
#else
        localtime_r(&time_t_now, &tm_buf);
#endif
        std::ostringstream ss;
        ss << std::put_time(&tm_buf, "%Y%m%d_%H%M%S");
        std::string ts = ss.str();
        
        std::filesystem::path originalPath(m_filepath);
        std::string stem = originalPath.stem().string();
        std::string ext = originalPath.extension().string();
        std::filesystem::path parent = originalPath.parent_path();
        
        std::filesystem::path backupPath = parent / (stem + "_old_" + ts + ext);
        
        std::error_code ec;
        std::filesystem::rename(originalPath, backupPath, ec);
        if (ec) {
            std::cerr << "[Logger Error] Failed to rotate log file: " << ec.message() << "\n";
        }
        
        // Prune old backups, ensuring max historical limit is maintained
        pruneBackupFiles();
        
        // Open a new file
        openLogFile();
    }
}

void Logger::pruneBackupFiles() {
    std::filesystem::path parentDir = std::filesystem::path(m_filepath).parent_path();
    if (parentDir.empty()) parentDir = ".";
    
    if (!std::filesystem::exists(parentDir)) return;
    
    std::string stem = std::filesystem::path(m_filepath).stem().string();
    std::string ext = std::filesystem::path(m_filepath).extension().string();
    
    std::vector<std::filesystem::path> backupFiles;
    for (const auto& entry : std::filesystem::directory_iterator(parentDir)) {
        if (entry.is_regular_file()) {
            std::filesystem::path path = entry.path();
            std::string filename = path.filename().string();
            // Match pattern starts with stem + "_old_" and matches extension
            if (filename.rfind(stem + "_old_", 0) == 0 && path.extension() == ext) {
                backupFiles.push_back(path);
            }
        }
    }
    
    // Sort lexicographically (chronological for YYYYMMDD_HHMMSS format)
    std::sort(backupFiles.begin(), backupFiles.end());
    
    // Keep maximum m_maxBackupFiles by removing oldest
    if (backupFiles.size() > m_maxBackupFiles) {
        size_t pruneCount = backupFiles.size() - m_maxBackupFiles;
        for (size_t i = 0; i < pruneCount; ++i) {
            std::error_code ec;
            std::filesystem::remove(backupFiles[i], ec);
        }
    }
}

void Logger::shutdownWorker() {
    {
        std::lock_guard<std::mutex> lock(m_queueMutex);
        m_shutdown = true;
    }
    m_cv.notify_all();
    if (m_workerThread.joinable()) {
        m_workerThread.join();
    }
}

void Logger::workerLoop() {
    while (true) {
        LogQueueEntry qEntry;
        {
            std::unique_lock<std::mutex> lock(m_queueMutex);
            m_cv.wait(lock, [this]() { return !m_queue.empty() || m_shutdown; });
            
            if (m_queue.empty() && m_shutdown) {
                break;
            }
            
            qEntry = std::move(m_queue.front());
            m_queue.pop();
        }
        
        writeEntryToDisk(qEntry.level, qEntry.message);
    }
    
    // Process remaining entries in the queue
    while (true) {
        LogQueueEntry qEntry;
        {
            std::lock_guard<std::mutex> lock(m_queueMutex);
            if (m_queue.empty()) {
                break;
            }
            qEntry = std::move(m_queue.front());
            m_queue.pop();
        }
        writeEntryToDisk(qEntry.level, qEntry.message);
    }
}

} // namespace diagnostics
