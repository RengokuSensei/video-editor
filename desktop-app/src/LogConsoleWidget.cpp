#include "LogConsoleWidget.h"

// QLogBridge Singleton
QLogBridge& QLogBridge::getInstance() {
    static QLogBridge instance;
    return instance;
}

QLogBridge::QLogBridge() {
    // Register the static callback to route standard C++ logs to the bridge QObject
    diagnostics::Logger::getInstance().setCallback(QLogBridge::loggerCallback);
}

QLogBridge::~QLogBridge() {
    diagnostics::Logger::getInstance().setCallback(nullptr);
}

void QLogBridge::loggerCallback(diagnostics::Logger::LogLevel level, const char* message) {
    emit getInstance().logReceived(static_cast<int>(level), QString::fromUtf8(message));
}
