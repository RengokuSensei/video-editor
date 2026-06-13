#include "LogConsoleWidget.h"
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QToolBar>
#include <QLabel>
#include <QScrollBar>

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


// LogConsoleWidget
LogConsoleWidget::LogConsoleWidget(QWidget* parent)
    : QDockWidget(parent)
    , m_textDisplay(nullptr)
    , m_levelFilter(nullptr)
    , m_searchBar(nullptr)
    , m_clearButton(nullptr)
    , m_autoScrollCheckBox(nullptr) {
    
    setWindowTitle("Diagnostics Log Console");
    setObjectName("DiagnosticsLogConsole");
    setAllowedAreas(Qt::AllDockWidgetAreas);

    setupUI();

    // Use QueuedConnection to safely marshal logs across thread contexts to the Qt main thread
    connect(&QLogBridge::getInstance(), &QLogBridge::logReceived,
            this, &LogConsoleWidget::onLogReceived, Qt::QueuedConnection);
}

LogConsoleWidget::~LogConsoleWidget() {
}

void LogConsoleWidget::setupUI() {
    QWidget* container = new QWidget(this);
    QVBoxLayout* mainLayout = new QVBoxLayout(container);
    mainLayout->setContentsMargins(5, 5, 5, 5);
    mainLayout->setSpacing(5);

    // Toolbar Layout
    QWidget* toolbarContainer = new QWidget(container);
    QHBoxLayout* toolbarLayout = new QHBoxLayout(toolbarContainer);
    toolbarLayout->setContentsMargins(0, 0, 0, 0);
    toolbarLayout->setSpacing(10);

    // 1. Severity level filter dropdown
    QLabel* filterLabel = new QLabel("Level:", toolbarContainer);
    m_levelFilter = new QComboBox(toolbarContainer);
    m_levelFilter->addItem("All Levels", -1);
    m_levelFilter->addItem("Trace & Above", static_cast<int>(diagnostics::Logger::LogLevel::TRACE));
    m_levelFilter->addItem("Debug & Above", static_cast<int>(diagnostics::Logger::LogLevel::DEBUG));
    m_levelFilter->addItem("Info & Above", static_cast<int>(diagnostics::Logger::LogLevel::INFO));
    m_levelFilter->addItem("Warning & Above", static_cast<int>(diagnostics::Logger::LogLevel::WARNING));
    m_levelFilter->addItem("Error & Above", static_cast<int>(diagnostics::Logger::LogLevel::ERROR));
    m_levelFilter->addItem("Critical Only", static_cast<int>(diagnostics::Logger::LogLevel::CRITICAL));
    
    // Default to Info & Above (index 3) to keep noise low initially
    m_levelFilter->setCurrentIndex(3);

    // 2. Search / filter bar
    m_searchBar = new QLineEdit(toolbarContainer);
    m_searchBar->setPlaceholderText("Filter logs by text...");
    m_searchBar->setClearButtonEnabled(true);

    // 3. Clear button
    m_clearButton = new QPushButton("Clear", toolbarContainer);
    m_clearButton->setFixedWidth(60);

    // 4. Auto-Scroll checkbox
    m_autoScrollCheckBox = new QCheckBox("Auto-Scroll", toolbarContainer);
    m_autoScrollCheckBox->setChecked(true);

    toolbarLayout->addWidget(filterLabel);
    toolbarLayout->addWidget(m_levelFilter);
    toolbarLayout->addWidget(m_searchBar, 1);
    toolbarLayout->addWidget(m_clearButton);
    toolbarLayout->addWidget(m_autoScrollCheckBox);

    // 5. QPlainTextEdit viewport
    m_textDisplay = new QPlainTextEdit(container);
    m_textDisplay->setReadOnly(true);
    m_textDisplay->setUndoRedoEnabled(false);
    
    // Apply a dedicated dark terminal design style sheet
    m_textDisplay->setStyleSheet(
        "QPlainTextEdit {"
        "  background-color: #0b0b0b;"
        "  border: 1px solid #282828;"
        "  border-radius: 4px;"
        "  font-family: 'Consolas', 'Courier New', monospace;"
        "  font-size: 11px;"
        "  line-height: 1.4;"
        "}"
    );

    mainLayout->addWidget(toolbarContainer);
    mainLayout->addWidget(m_textDisplay);

    setWidget(container);

    // Wire up UI state update signals
    connect(m_levelFilter, QOverload<int>::of(&QComboBox::currentIndexChanged), this, &LogConsoleWidget::onFilterChanged);
    connect(m_searchBar, &QLineEdit::textChanged, this, &LogConsoleWidget::onFilterChanged);
    connect(m_clearButton, &QPushButton::clicked, this, &LogConsoleWidget::onClearClicked);
}

void LogConsoleWidget::onLogReceived(int level, const QString& message) {
    diagnostics::Logger::LogLevel log_level = static_cast<diagnostics::Logger::LogLevel>(level);
    
    // Cache log item
    m_allLogs.push_back({log_level, message});
    if (m_allLogs.size() > kMaxLogCache) {
        m_allLogs.pop_front();
    }

    // Append to UI immediately if it matches the current filter settings
    if (passesFilter(log_level, message)) {
        appendLog(log_level, message);
    }
}

void LogConsoleWidget::onFilterChanged() {
    reFilterLogs();
}

void LogConsoleWidget::onClearClicked() {
    m_allLogs.clear();
    m_textDisplay->clear();
}

void LogConsoleWidget::appendLog(diagnostics::Logger::LogLevel level, const QString& message) {
    QString clean_msg = message;
    if (clean_msg.endsWith('\n')) {
        clean_msg.chop(1);
    }
    if (clean_msg.endsWith('\r')) {
        clean_msg.chop(1);
    }

    // Color palette matching the visual log severity levels
    QString color = "#e0e0e0"; 
    switch (level) {
        case diagnostics::Logger::LogLevel::TRACE:
            color = "#777777"; // dark gray
            break;
        case diagnostics::Logger::LogLevel::DEBUG:
            color = "#8b949e"; // slate gray
            break;
        case diagnostics::Logger::LogLevel::INFO:
            color = "#58a6ff"; // neon blue
            break;
        case diagnostics::Logger::LogLevel::WARNING:
            color = "#d29922"; // amber/yellow
            break;
        case diagnostics::Logger::LogLevel::ERROR:
            color = "#f85149"; // error red
            break;
        case diagnostics::Logger::LogLevel::CRITICAL:
            color = "#ff7b72; font-weight: bold; background-color: #3b0000;"; // highlighted critical red
            break;
    }

    // Safely format and append HTML content
    QString escaped = clean_msg.toHtmlEscaped();
    m_textDisplay->appendHtml(
        QString("<span style=\"color: %1;\">%2</span>").arg(color, escaped)
    );

    // Scroll to bottom if auto-scroll is enabled
    if (m_autoScrollCheckBox->isChecked()) {
        QScrollBar* bar = m_textDisplay->verticalScrollBar();
        if (bar) {
            bar->setValue(bar->maximum());
        }
    }
}

void LogConsoleWidget::reFilterLogs() {
    m_textDisplay->clear();
    for (const auto& item : m_allLogs) {
        if (passesFilter(item.level, item.message)) {
            appendLog(item.level, item.message);
        }
    }
}

bool LogConsoleWidget::passesFilter(diagnostics::Logger::LogLevel level, const QString& message) const {
    // 1. Check severity level filter dropdown
    int filter_idx = m_levelFilter->currentIndex();
    if (filter_idx > 0) {
        int min_level = m_levelFilter->currentData().toInt();
        if (static_cast<int>(level) < min_level) {
            return false;
        }
    }

    // 2. Check search keyword matching (case-insensitive)
    QString search_text = m_searchBar->text().trimmed();
    if (!search_text.isEmpty()) {
        if (!message.contains(search_text, Qt::CaseInsensitive)) {
            return false;
        }
    }

    return true;
}
