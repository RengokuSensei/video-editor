#pragma once

#include <QMainWindow>
#include <QListWidget>
#include <QTableWidget>
#include <QLabel>
#include <QPushButton>
#include <QSplitter>

class UIEngineBridge;
class LogConsoleWidget;

class MainWindow : public QMainWindow {
    Q_OBJECT
public:
    explicit MainWindow(QWidget *parent = nullptr);
    ~MainWindow();

private slots:
    // Button slots
    void onPlayClicked();
    void onPauseClicked();
    void onAddTrackClicked();
    void onImportClipClicked();
    void onExportClicked();
    void onMediaBinItemDoubleClicked(QListWidgetItem* item);
    void onAutoCutClicked();
    
    // Bridge event callbacks
    void updateStatusText(const QString& status);
    void updatePlaybackControls(bool isPlaying);
    void onFrameRendered(const QString& path);
    void onAutoCutCompleted(const QStringList& cuts);

private:
    // Core Layout Panels
    QWidget* createMediaBinWidget();
    QWidget* createMonitorWidget();
    QWidget* createTimelineWidget();

    // UI elements
    QListWidget* m_mediaBinList;
    QLabel* m_monitorCanvas;
    QTableWidget* m_timelineTracks;
    LogConsoleWidget* m_logConsole;
    
    // Buttons and status indicators
    QPushButton* m_playButton;
    QPushButton* m_pauseButton;
    QPushButton* m_importButton;
    QPushButton* m_addTrackButton;
    QPushButton* m_exportButton;
    QPushButton* m_autoCutButton;
    QLabel* m_statusLabel;

    // Bridge linking Qt to C++ MLT core
    UIEngineBridge* m_bridge;

    // Helper functions
    void setupUI();
    void setupConnections();
    void applyDarkTheme();
};
