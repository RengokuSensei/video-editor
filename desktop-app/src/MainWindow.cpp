#include "MainWindow.h"
#include "UI_Engine_Bridge.h"
#include "LogConsoleWidget.h"
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QHeaderView>
#include <QFileDialog>
#include <QMessageBox>
#include <QTableWidgetItem>
#include <QDebug>
#include <QFileInfo>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
    , m_mediaBinList(nullptr)
    , m_monitorCanvas(nullptr)
    , m_playbackSlider(nullptr)
    , m_timelineTracks(nullptr)
    , m_logConsole(nullptr)
    , m_playButton(nullptr)
    , m_pauseButton(nullptr)
    , m_importButton(nullptr)
    , m_addTrackButton(nullptr)
    , m_exportButton(nullptr)
    , m_autoCutButton(nullptr)
    , m_statusLabel(nullptr)
    , m_bridge(nullptr)
{
    setWindowTitle("High-Performance Video Editor");
    resize(1280, 720);

    // Initialize Bridge
    m_bridge = new UIEngineBridge(this);

    // Initialize UI and Theme
    setupUI();
    setupConnections();
    applyDarkTheme();

    // Populate timeline with initial tracks
    m_bridge->handleAddTrack(0);
    m_bridge->handleAddTrack(1);
    
    // Add default mock clips to the bin
    if (m_mediaBinList) {
        m_mediaBinList->addItem("Dynamic Generator: Color [Blue]");
        m_mediaBinList->addItem("Dynamic Generator: Color [Red]");
        m_mediaBinList->addItem("Dynamic Generator: Noise [Static]");
    }
}

MainWindow::~MainWindow() {
    // Parent QObject structures clean up child widgets automatically
}

void MainWindow::setupUI() {
    // Master central layout uses QSplitter (Vertical)
    QSplitter* mainVerticalSplitter = new QSplitter(Qt::Vertical, this);
    setCentralWidget(mainVerticalSplitter);

    // Instantiate and dock the interactive log console at the bottom
    m_logConsole = new LogConsoleWidget(this);
    addDockWidget(Qt::BottomDockWidgetArea, m_logConsole);

    // Top Region Splitter (Horizontal: Media Bin vs Playback Monitor)
    QSplitter* topHorizontalSplitter = new QSplitter(Qt::Horizontal, mainVerticalSplitter);

    // Add Left Panel (Media Bin) and Right Panel (Monitor) to top region
    topHorizontalSplitter->addWidget(createMediaBinWidget());
    topHorizontalSplitter->addWidget(createMonitorWidget());
    topHorizontalSplitter->setStretchFactor(0, 1);
    topHorizontalSplitter->setStretchFactor(1, 2);

    // Add Top Region and Bottom Region (Timeline) to main vertical splitter
    mainVerticalSplitter->addWidget(topHorizontalSplitter);
    mainVerticalSplitter->addWidget(createTimelineWidget());
    mainVerticalSplitter->setStretchFactor(0, 2);
    mainVerticalSplitter->setStretchFactor(1, 1);
}

QWidget* MainWindow::createMediaBinWidget() {
    QWidget* container = new QWidget(this);
    QVBoxLayout* layout = new QVBoxLayout(container);
    layout->setContentsMargins(10, 10, 10, 10);

    QLabel* titleLabel = new QLabel("Media Bin", container);
    titleLabel->setStyleSheet("font-weight: bold; font-size: 14px; color: #007acc;");

    m_mediaBinList = new QListWidget(container);
    m_mediaBinList->setObjectName("MediaBin");

    m_importButton = new QPushButton("Import Clip", container);
    m_importButton->setObjectName("AccentButton");

    layout->addWidget(titleLabel);
    layout->addWidget(m_mediaBinList);
    layout->addWidget(m_importButton);

    return container;
}

QWidget* MainWindow::createMonitorWidget() {
    QWidget* container = new QWidget(this);
    QVBoxLayout* layout = new QVBoxLayout(container);
    layout->setContentsMargins(10, 10, 10, 10);

    QLabel* titleLabel = new QLabel("Playback Monitor", container);
    titleLabel->setStyleSheet("font-weight: bold; font-size: 14px; color: #007acc;");

    // Monitor canvas acts as preview frame display viewport
    m_monitorCanvas = new QLabel(container);
    m_monitorCanvas->setObjectName("MonitorCanvas");
    m_monitorCanvas->setAlignment(Qt::AlignCenter);
    m_monitorCanvas->setText("Headless Engine Preview Mode\n[Click Play to trigger pipeline]");
    m_monitorCanvas->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);

    // Playback slider / progress bar
    m_playbackSlider = new QSlider(Qt::Horizontal, container);
    m_playbackSlider->setObjectName("PlaybackSlider");
    m_playbackSlider->setRange(0, 150);

    // Control bar containing player buttons
    QWidget* controlBar = new QWidget(container);
    QHBoxLayout* controlLayout = new QHBoxLayout(controlBar);
    controlLayout->setContentsMargins(0, 5, 0, 0);

    m_playButton = new QPushButton("Play", controlBar);
    m_pauseButton = new QPushButton("Pause", controlBar);
    m_exportButton = new QPushButton("Export Frame", controlBar);
    m_statusLabel = new QLabel("Status: Idle", controlBar);

    controlLayout->addWidget(m_playButton);
    controlLayout->addWidget(m_pauseButton);
    controlLayout->addWidget(m_exportButton);
    controlLayout->addStretch();
    controlLayout->addWidget(m_statusLabel);

    layout->addWidget(titleLabel);
    layout->addWidget(m_monitorCanvas, 1);
    layout->addWidget(m_playbackSlider);
    layout->addWidget(controlBar);

    return container;
}

QWidget* MainWindow::createTimelineWidget() {
    QWidget* container = new QWidget(this);
    QVBoxLayout* layout = new QVBoxLayout(container);
    layout->setContentsMargins(10, 10, 10, 10);

    QWidget* headerBar = new QWidget(container);
    QHBoxLayout* headerLayout = new QHBoxLayout(headerBar);
    headerLayout->setContentsMargins(0, 0, 0, 5);

    QLabel* titleLabel = new QLabel("Multitrack Timeline", headerBar);
    titleLabel->setStyleSheet("font-weight: bold; font-size: 14px; color: #007acc;");

    m_addTrackButton = new QPushButton("+ Add Track", headerBar);
    m_addTrackButton->setObjectName("AccentButton");
    m_addTrackButton->setFixedWidth(100);

    m_autoCutButton = new QPushButton("Auto-Cut (AI)", headerBar);
    m_autoCutButton->setObjectName("AccentButton");
    m_autoCutButton->setFixedWidth(100);

    headerLayout->addWidget(titleLabel);
    headerLayout->addStretch();
    headerLayout->addWidget(m_autoCutButton);
    headerLayout->addWidget(m_addTrackButton);

    // Timeline tracks layout (represented by a TableView)
    m_timelineTracks = new QTableWidget(container);
    m_timelineTracks->setObjectName("TimelineView");
    m_timelineTracks->setColumnCount(1);
    m_timelineTracks->setRowCount(2);
    m_timelineTracks->horizontalHeader()->setVisible(false);
    m_timelineTracks->horizontalHeader()->setSectionResizeMode(QHeaderView::Stretch);
    m_timelineTracks->verticalHeader()->setDefaultSectionSize(45);
    
    // Set headers
    m_timelineTracks->setVerticalHeaderLabels(QStringList() << "Track V0" << "Track A0");

    // Add placeholder clips in timeline
    m_timelineTracks->setItem(0, 0, new QTableWidgetItem(" [00:00 - 05:00] Color Clip [Blue] "));
    m_timelineTracks->setItem(1, 0, new QTableWidgetItem(" [00:00 - 05:00] Master Audio track "));

    layout->addWidget(headerBar);
    layout->addWidget(m_timelineTracks, 1);

    return container;
}

void MainWindow::setupConnections() {
    // Connect buttons to local slots
    connect(m_playButton, &QPushButton::clicked, this, &MainWindow::onPlayClicked);
    connect(m_pauseButton, &QPushButton::clicked, this, &MainWindow::onPauseClicked);
    connect(m_addTrackButton, &QPushButton::clicked, this, &MainWindow::onAddTrackClicked);
    connect(m_importButton, &QPushButton::clicked, this, &MainWindow::onImportClipClicked);
    connect(m_exportButton, &QPushButton::clicked, this, &MainWindow::onExportClicked);
    connect(m_autoCutButton, &QPushButton::clicked, this, &MainWindow::onAutoCutClicked);
    connect(m_mediaBinList, &QListWidget::itemDoubleClicked, this, &MainWindow::onMediaBinItemDoubleClicked);
    connect(m_playbackSlider, &QSlider::valueChanged, this, &MainWindow::onSliderValueChanged);

    // Connect Bridge signals to UI slots
    connect(m_bridge, &UIEngineBridge::timelineInfoUpdated, this, &MainWindow::updateStatusText);
    connect(m_bridge, &UIEngineBridge::playbackStateChanged, this, &MainWindow::updatePlaybackControls);
    connect(m_bridge, &UIEngineBridge::frameRendered, this, &MainWindow::onFrameRendered);
    connect(m_bridge, &UIEngineBridge::autoCutCompleted, this, &MainWindow::onAutoCutCompleted);
}

void MainWindow::onPlayClicked() {
    m_bridge->handlePlay();
}

void MainWindow::onPauseClicked() {
    m_bridge->handlePause();
}

void MainWindow::onAddTrackClicked() {
    int nextTrackIndex = m_timelineTracks->rowCount();
    m_timelineTracks->insertRow(nextTrackIndex);
    m_timelineTracks->setVerticalHeaderItem(nextTrackIndex, new QTableWidgetItem(QString("Track V%1").arg(nextTrackIndex / 2 + 1)));
    m_bridge->handleAddTrack(nextTrackIndex);
}

void MainWindow::onImportClipClicked() {
    QString filePath = QFileDialog::getOpenFileName(this, 
        tr("Import Media File"), "", 
        tr("Video/Audio Files (*.mp4 *.avi *.mkv *.mov *.mp3 *.wav *.ppm);;All Files (*)"));
        
    if (!filePath.isEmpty()) {
        QFileInfo fileInfo(filePath);
        QString fileName = fileInfo.fileName();
        
        // Add actual file and path to the media bin
        m_mediaBinList->addItem(QString("%1 (%2)").arg(fileName, filePath));
        
        // Pass it to the bridge targeting track 0
        // MLT uses "avformat" service for real files, or "image2" / local loaders.
        m_bridge->handleAddClip("avformat", filePath, 0);
        
        // Visually update the timeline table widget
        int clipCount = m_mediaBinList->count();
        m_timelineTracks->setItem(0, 0, new QTableWidgetItem(
            QString(" [00:00 - 05:00] Base Track | %1 clips loaded (Last: %2) ").arg(clipCount).arg(fileName)
        ));
        
        qDebug() << "[GUI] User imported actual media file:" << filePath;
    }
}

void MainWindow::onExportClicked() {
    m_bridge->handleExportFrame(0, "exported_frame.ppm");
}

void MainWindow::onMediaBinItemDoubleClicked(QListWidgetItem* item) {
    if (!item) return;

    QString text = item->text();
    // Extract filepath from format: "filename.mp4 (C:/path/to/filename.mp4)"
    int startIdx = text.lastIndexOf('(');
    int endIdx = text.lastIndexOf(')');
    if (startIdx != -1 && endIdx != -1 && endIdx > startIdx) {
        QString filePath = text.mid(startIdx + 1, endIdx - startIdx - 1);
        QFileInfo fileInfo(filePath);
        QString fileName = fileInfo.fileName();

        // Add to track 0 in timeline table widget
        m_timelineTracks->setItem(0, 0, new QTableWidgetItem(
            QString(" [00:00 - 05:00] Base Track | Active Clip: %1 ").arg(fileName)
        ));

        // Notify the bridge
        m_bridge->handleAddClip("avformat", filePath, 0);

        // Update playback monitor with instructions
        m_monitorCanvas->setText(QString("Loaded active clip:\n%1\n\n[Click 'Export Frame' to preview frame]").arg(fileName));
        m_statusLabel->setText(QString("Active clip: %1").arg(fileName));
        
        qDebug() << "[GUI] Mounted clip to timeline via double-click:" << fileName;
    }
}

void MainWindow::onAutoCutClicked() {
    m_statusLabel->setText("Status: Analyzing (AI)...");
    m_monitorCanvas->setText("ONNX Runtime + DirectML processing active...\n[Running AI scene detection on target NPU/GPU]");
    m_bridge->handleAutoCut(0); // Analyze base track 0
}

void MainWindow::onSliderValueChanged(int value) {
    if (m_bridge) {
        if (!m_bridge->isPlaying()) {
            m_bridge->handleExportFrame(value, "exported_frame.ppm");
        }
    }
}

void MainWindow::onAutoCutCompleted(const QStringList& cuts) {
    if (cuts.isEmpty()) {
        QMessageBox::information(this, "AI Auto-Cut", "No scene cuts detected.");
        m_statusLabel->setText("Status: Idle");
        return;
    }

    int shotCount = cuts.size() + 1;
    m_timelineTracks->setColumnCount(shotCount);
    
    // Configure headers to split visually
    m_timelineTracks->horizontalHeader()->setVisible(true);
    QStringList headers;
    
    int prevFrame = 0;
    for (int i = 0; i < cuts.size(); ++i) {
        int cutFrame = cuts[i].toInt();
        headers << QString("Shot %1 (f%2-%3)").arg(i + 1).arg(prevFrame).arg(cutFrame);
        
        QString cellText = QString(" Shot %1\n [%2-%3] ").arg(i + 1).arg(prevFrame).arg(cutFrame);
        m_timelineTracks->setItem(0, i, new QTableWidgetItem(cellText));
        m_timelineTracks->item(0, i)->setBackground(QColor(32, 55, 75));
        m_timelineTracks->item(0, i)->setForeground(QColor(114, 178, 232));
        
        prevFrame = cutFrame;
    }
    headers << QString("Shot %1 (f%2-End)").arg(shotCount).arg(prevFrame);
    m_timelineTracks->setItem(0, cuts.size(), new QTableWidgetItem(QString(" Shot %1\n [%2-End] ").arg(shotCount).arg(prevFrame)));
    m_timelineTracks->item(0, cuts.size())->setBackground(QColor(32, 55, 75));
    m_timelineTracks->item(0, cuts.size())->setForeground(QColor(114, 178, 232));
    
    m_timelineTracks->setHorizontalHeaderLabels(headers);
    
    m_statusLabel->setText(QString("Status: AI cut complete (%1 shots)").arg(shotCount));
    m_monitorCanvas->setText(QString("AI Auto-Cut completed successfully!\n\nDetected %1 scene cuts.\nTimeline track partitioned into %2 shots.").arg(cuts.size()).arg(shotCount));
    
    QMessageBox::information(this, "AI Scene Detection Completed", 
        QString("DirectML Hardware Accelerated ONNX model completed.\nDetected %1 cuts.\nTimeline successfully sliced into %2 sub-clips.").arg(cuts.size()).arg(shotCount));
}

void MainWindow::updateStatusText(const QString& status) {
    if (m_statusLabel) {
        m_statusLabel->setText(status);
    }
}

void MainWindow::updatePlaybackControls(bool isPlaying) {
    if (isPlaying) {
        m_statusLabel->setText("Status: Playing...");
        m_monitorCanvas->setText("Active Playback Loop running...\n[Rendering frame pipeline via MLT core]");
        m_playButton->setEnabled(false);
        m_pauseButton->setEnabled(true);
    } else {
        m_statusLabel->setText("Status: Paused");
        m_monitorCanvas->setText("Playback Paused.\n[Frame buffer preserved]");
        m_playButton->setEnabled(true);
        m_pauseButton->setEnabled(false);
    }
}

void MainWindow::onFrameRendered(const QString& path) {
    QImage img(path);
    if (!img.isNull()) {
        m_monitorCanvas->setPixmap(QPixmap::fromImage(img).scaled(m_monitorCanvas->size(), Qt::KeepAspectRatio, Qt::SmoothTransformation));
        if (m_bridge) {
            m_playbackSlider->blockSignals(true);
            m_playbackSlider->setValue(m_bridge->currentFrame());
            m_playbackSlider->blockSignals(false);
            
            if (m_bridge->isPlaying()) {
                m_statusLabel->setText(QString("Status: Playing... Frame %1").arg(m_bridge->currentFrame()));
            } else {
                m_statusLabel->setText(QString("Status: Stopped at Frame %1").arg(m_bridge->currentFrame()));
            }
        }
    } else {
        QMessageBox::warning(this, "Render Error", "Rendered frame PPM file could not be loaded into preview monitor.");
    }
}

void MainWindow::applyDarkTheme() {
    // Custom charcoal styling sheet for premium dark aesthetics
    QString qss = R"(
        QMainWindow {
            background-color: #121212;
        }
        
        QWidget {
            background-color: #1e1e1e;
            color: #e0e0e0;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 12px;
        }

        QSplitter::handle {
            background-color: #2d2d2d;
            height: 4px;
            width: 4px;
        }

        QLabel {
            color: #e0e0e0;
            background-color: transparent;
        }

        QPushButton {
            background-color: #2d2d2d;
            color: #ffffff;
            border: 1px solid #3f3f3f;
            border-radius: 4px;
            padding: 6px 14px;
            min-height: 18px;
        }

        QPushButton:hover {
            background-color: #383838;
            border-color: #4f4f4f;
        }

        QPushButton:pressed {
            background-color: #1f1f1f;
        }

        QPushButton:disabled {
            background-color: #1a1a1a;
            color: #5c5c5c;
            border-color: #242424;
        }

        QPushButton#AccentButton {
            background-color: #007acc;
            border: 1px solid #0098ff;
        }

        QPushButton#AccentButton:hover {
            background-color: #0098ff;
        }

        QListWidget {
            background-color: #151515;
            border: 1px solid #2d2d2d;
            border-radius: 4px;
            padding: 5px;
        }

        QListWidget::item {
            padding: 6px 4px;
            border-bottom: 1px solid #222222;
        }

        QListWidget::item:hover {
            background-color: #2a2a2a;
            color: #ffffff;
        }

        QListWidget::item:selected {
            background-color: #007acc;
            color: #ffffff;
        }

        QTableWidget {
            background-color: #151515;
            border: 1px solid #2d2d2d;
            border-radius: 4px;
            gridline-color: #242424;
        }

        QTableWidget::item {
            background-color: #1e2830;
            color: #72b2e8;
            border: 1px solid #203c54;
            border-radius: 3px;
            padding: 8px;
            margin: 4px;
        }

        QTableWidget::item:selected {
            background-color: #007acc;
            color: #ffffff;
        }

        QHeaderView::section {
            background-color: #282828;
            color: #888888;
            padding: 4px;
            border: 1px solid #1c1c1c;
        }

        QLabel#MonitorCanvas {
            background-color: #090909;
            border: 1px solid #2d2d2d;
            border-radius: 4px;
            color: #888888;
            font-size: 13px;
        }

        QSlider::groove:horizontal {
            border: 1px solid #3a3a3a;
            height: 6px;
            background: #151515;
            border-radius: 3px;
        }

        QSlider::handle:horizontal {
            background: #007acc;
            border: 1px solid #0098ff;
            width: 14px;
            height: 14px;
            margin: -4px 0;
            border-radius: 7px;
        }

        QSlider::handle:horizontal:hover {
            background: #0098ff;
        }

        QSlider::sub-page:horizontal {
            background: #007acc;
            border-radius: 3px;
        }
    )";
    
    setStyleSheet(qss);
}
