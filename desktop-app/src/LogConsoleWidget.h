#pragma once

#include <QObject>
#include <QString>
#include "diagnostics/Logger.h"

// The thread-safe log receiver bridge that routes standard C++ logs to the Qt event loop
class QLogBridge : public QObject {
    Q_OBJECT
signals:
    void logReceived(int level, const QString& message);

public:
    static QLogBridge& getInstance();
    static void loggerCallback(diagnostics::Logger::LogLevel level, const char* message);

private:
    QLogBridge();
    ~QLogBridge();
};
