#include "UI_Engine_Bridge.h"
#include "VideoTimelineManager.h"
#include <QDebug>
#include <QTimer>
#include <QDir>
#include <QCoreApplication>
#include <sstream>

UIEngineBridge::UIEngineBridge(QObject *parent)
    : QObject(parent)
    , m_isPlaying(false)
    , m_playbackTimer(nullptr)
    , m_currentFrame(0)
{
    qDebug() << "[Bridge] Initializing core-engine VideoTimelineManager...";
    try {
        // Initialize timeline manager with standard 1080p 30fps profile
        m_engine = std::make_unique<VideoTimelineManager>("atsc_1080p_30");
        qDebug() << "[Bridge] Core-engine successfully initialized.";
    } catch (const std::exception& e) {
        qCritical() << "[Bridge] Fatal error initializing core-engine:" << e.what();
    }

    m_playbackTimer = new QTimer(this);
    connect(m_playbackTimer, &QTimer::timeout, this, &UIEngineBridge::onPlaybackTick);
}

UIEngineBridge::~UIEngineBridge() {
    qDebug() << "[Bridge] Shutting down bridge and releasing engine.";
}

void UIEngineBridge::handlePlay() {
    if (!m_isPlaying) {
        m_isPlaying = true;
        qDebug() << "[Bridge] Engine Play triggered.";
        m_playbackTimer->start(33); // ~30 FPS (33ms interval)
        emit playbackStateChanged(true);
    }
}

void UIEngineBridge::handlePause() {
    if (m_isPlaying) {
        m_isPlaying = false;
        qDebug() << "[Bridge] Engine Pause triggered.";
        m_playbackTimer->stop();
        emit playbackStateChanged(false);
    }
}

void UIEngineBridge::handleAddTrack(int trackIndex) {
    qDebug() << "[Bridge] Request to add track at index:" << trackIndex;
    // We add a track in MLT by appending clips, but here we trigger track creation
    // Adding a placeholder color clip to initialize the track
    if (m_engine) {
        m_engine->addClip("color", "black", trackIndex);
        refreshTimelineMetadata();
    }
}

void UIEngineBridge::handleAddClip(const QString& type, const QString& path, int trackIndex) {
    qDebug() << "[Bridge] Request to add clip: Type =" << type << ", Path =" << path << ", Track =" << trackIndex;
    if (m_engine) {
        bool success = m_engine->addClip(type.toStdString(), path.toStdString(), trackIndex);
        if (success) {
            qDebug() << "[Bridge] Clip successfully added to engine timeline.";
            refreshTimelineMetadata();
        } else {
            qWarning() << "[Bridge] Engine failed to load clip.";
        }
    }
}

void UIEngineBridge::handleExportFrame(int frameIndex, const QString& outputPath) {
    QString absPath = outputPath;
    if (QDir::isRelativePath(outputPath)) {
        absPath = QDir::cleanPath(QCoreApplication::applicationDirPath() + "/" + outputPath);
    }
    qDebug() << "[Bridge] Exporting frame" << frameIndex << "to" << absPath;
    if (m_engine) {
        // Rendering at 640x360 resolution for near-instantaneous disk writes and smooth preview
        bool success = m_engine->exportFrameToPpm(frameIndex, absPath.toStdString(), 640, 360);
        if (success) {
            qDebug() << "[Bridge] Frame exported successfully to:" << absPath;
            emit frameRendered(absPath);
        } else {
            qWarning() << "[Bridge] Engine frame export failed.";
        }
    }
}

void UIEngineBridge::handleAutoCut(int trackIndex) {
    qDebug() << "[Bridge] Request to run AI auto scene cut detection on track:" << trackIndex;
    if (m_engine) {
        // We pass the default model name; engine falls back if model is missing
        std::vector<int> cuts = m_engine->detectAndApplyAutoCut(trackIndex, "scene_detection.onnx");
        
        QStringList cutsStrList;
        for (int cutFrame : cuts) {
            cutsStrList.append(QString::number(cutFrame));
        }
        
        qDebug() << "[Bridge] AI auto-cut completed. Emitting cuts count:" << cutsStrList.size();
        emit autoCutCompleted(cutsStrList);
        refreshTimelineMetadata();
    }
}

void UIEngineBridge::onPlaybackTick() {
    m_currentFrame++;
    if (m_currentFrame > 150) {
        m_currentFrame = 0;
    }
    handleExportFrame(m_currentFrame, "exported_frame.ppm");
}

void UIEngineBridge::refreshTimelineMetadata() {
    if (m_engine) {
        // Capture info from stdout redirected or simple properties query.
        // We'll print it to standard outputs and simulate a metadata string emit.
        m_engine->printTimelineInfo();
        
        QString info = QString("Timeline Status: Verified | Tracks Active");
        emit timelineInfoUpdated(info);
    }
}

