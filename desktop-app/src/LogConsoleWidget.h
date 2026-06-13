#pragma once

#include <QDockWidget>
#include <QPlainTextEdit>
#include <QComboBox>
#include <QLineEdit>
#include <QPushButton>
#include <QCheckBox>
#include <QVector>
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

class LogConsoleWidget : public QDockWidget {
    Q_OBJECT
public:
    explicit LogConsoleWidget(QWidget* parent = nullptr);
    ~LogConsoleWidget();

private slots:
    void onLogReceived(int level, const QString& message);
    void onFilterChanged();
    void onClearClicked();

private:
    void setupUI();
    void appendLog(diagnostics::Logger::LogLevel level, const QString& message);
    void reFilterLogs();
    bool passesFilter(diagnostics::Logger::LogLevel level, const QString& message) const;

    struct LogItem {
        diagnostics::Logger::LogLevel level;
        QString message;
    };

    // UI elements
    QPlainTextEdit* m_textDisplay;
    QComboBox* m_levelFilter;
    QLineEdit* m_searchBar;
    QPushButton* m_clearButton;
    QCheckBox* m_autoScrollCheckBox;

    // Cache of logged items
    QVector<LogItem> m_allLogs;
    static constexpr int kMaxLogCache = 1000;
};
