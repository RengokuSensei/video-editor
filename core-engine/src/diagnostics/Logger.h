#pragma once

#include <string>
#include <mutex>
#include <queue>
#include <condition_variable>
#include <thread>
#include <fstream>

namespace diagnostics {

class Logger {
public:
    enum class LogLevel {
        TRACE,
        DEBUG,
        INFO,
        WARNING,
        ERROR,
        CRITICAL
    };

    enum class LogMode {
        Sync,
        Async
    };

    struct LogQueueEntry {
        LogLevel level;
        std::string message;
    };

    using LogCallback = void (*)(LogLevel level, const char* message);

    static Logger& getInstance();

    // Configure the logger filepath, mode, size limit (10MB default), and backup limit (5 default)
    void configure(const std::string& filepath, LogMode mode, size_t maxFileSize = 10 * 1024 * 1024, size_t maxBackupFiles = 5);

    // Register a callback to intercept log entries (useful for GUI log consoles)
    void setCallback(LogCallback callback);

    // Core log function, captures filename, line number, level, and formatted string
    void log(LogLevel level, const char* filename, int line, const char* format, ...);

    // Flush any pending logs (especially useful in Async mode)
    void flush();

    // Prevent copy/assignment
    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;

private:
    Logger();
    ~Logger();

    void openLogFile();
    void writeLogEntry(LogLevel level, const char* filename, int line, const std::string& message);
    void writeEntryToDisk(LogLevel level, const std::string& entry);
    void checkRotation();
    void pruneBackupFiles();
    void shutdownWorker();
    void workerLoop();

    std::string m_filepath;
    LogMode m_mode;
    size_t m_maxFileSize;
    size_t m_maxBackupFiles;

    std::ofstream m_fileStream;
    std::mutex m_logMutex;         // Protects file stream write and rotation checks

    // Async worker queue and thread structures
    std::queue<LogQueueEntry> m_queue;
    std::mutex m_queueMutex;       // Protects async queue
    std::condition_variable m_cv;
    std::thread m_workerThread;
    bool m_shutdown;

    LogCallback m_callback;
};

} // namespace diagnostics

// Clean macro interfaces for general use in core-engine
#define CORE_LOG_TRACE(format, ...) \
    ::diagnostics::Logger::getInstance().log(::diagnostics::Logger::LogLevel::TRACE, __FILE__, __LINE__, format, ##__VA_ARGS__)

#define CORE_LOG_DEBUG(format, ...) \
    ::diagnostics::Logger::getInstance().log(::diagnostics::Logger::LogLevel::DEBUG, __FILE__, __LINE__, format, ##__VA_ARGS__)

#define CORE_LOG_INFO(format, ...) \
    ::diagnostics::Logger::getInstance().log(::diagnostics::Logger::LogLevel::INFO, __FILE__, __LINE__, format, ##__VA_ARGS__)

#define CORE_LOG_WARNING(format, ...) \
    ::diagnostics::Logger::getInstance().log(::diagnostics::Logger::LogLevel::WARNING, __FILE__, __LINE__, format, ##__VA_ARGS__)

#define CORE_LOG_ERROR(format, ...) \
    ::diagnostics::Logger::getInstance().log(::diagnostics::Logger::LogLevel::ERROR, __FILE__, __LINE__, format, ##__VA_ARGS__)

#define CORE_LOG_CRITICAL(format, ...) \
    ::diagnostics::Logger::getInstance().log(::diagnostics::Logger::LogLevel::CRITICAL, __FILE__, __LINE__, format, ##__VA_ARGS__)
