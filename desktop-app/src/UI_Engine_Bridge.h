#pragma once

#include <QObject>
#include <QString>
#include <memory>

// Forward declaration of core-engine classes to keep header decoupled from MLT
class VideoTimelineManager;

class UIEngineBridge : public QObject {
    Q_OBJECT
public:
    explicit UIEngineBridge(QObject *parent = nullptr);
    ~UIEngineBridge();

    /**
     * @brief Check whether the engine is currently in a playing state
     */
    bool isPlaying() const { return m_isPlaying; }

public slots:
    /**
     * @brief Trigger timeline playback
     */
    void handlePlay();

    /**
     * @brief Trigger timeline pause
     */
    void handlePause();

    /**
     * @brief Adds a track to the multitrack timeline
     * @param trackIndex The target track index to add
     */
    void handleAddTrack(int trackIndex);

    /**
     * @brief Adds a media clip to the timeline
     * @param type The MLT producer type (e.g., "color", "avformat")
     * @param path The filepath or color resource
     * @param trackIndex The index of the track to insert into
     */
    void handleAddClip(const QString& type, const QString& path, int trackIndex);

    /**
     * @brief Exports a frame at the current timeline position to a PPM file
     * @param frameIndex The frame position to export
     * @param outputPath The target output filepath
     */
    void handleExportFrame(int frameIndex, const QString& outputPath);

    /**
     * @brief Trigger AI auto-cut process on target track
     * @param trackIndex The target track index
     */
    void handleAutoCut(int trackIndex);

signals:
    /**
     * @brief Emitted when engine timeline diagnostics change
     */
    void timelineInfoUpdated(const QString& info);

    /**
     * @brief Emitted when the engine playback state toggles (true = playing, false = paused)
     */
    void playbackStateChanged(bool isPlaying);

    /**
     * @brief Emitted when a frame is exported to disk
     */
    void frameRendered(const QString& path);

    /**
     * @brief Emitted when AI auto-cut completes, providing a list of cuts
     */
    void autoCutCompleted(const QStringList& cuts);

private:
    std::unique_ptr<VideoTimelineManager> m_engine;
    bool m_isPlaying;

    /**
     * @brief Helper to query latest engine state and notify slots/signals
     */
    void refreshTimelineMetadata();
};
