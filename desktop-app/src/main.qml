import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15

ApplicationWindow {
    id: root
    visible: true
    width: 1280
    height: 720
    title: "High-Performance Video Editor (Qt Quick QML)"
    background: Rectangle { color: "#121212" }

    // State properties
    property string activeClipName: "No clip loaded"
    property string activeClipPath: ""
    property double scaleValue: 1.0
    property int posXValue: 0
    property int posYValue: 0
    property int cropValue: 0
    property bool gpuAcceleration: true
    property bool npuProcessing: false
    property string blendMode: "Normal"

    // Zoom and Timeline workspace properties
    property real zoomFactor: 1.5
    property int timelineDurationFrames: 600

    // Force frame refresh by appending a timestamp to URL
    property string frameSource: ""
    property string appStatus: "Status: Idle"

    ListModel {
        id: trackModel
        ListElement { name: "Track V0"; type: "video" }
        ListElement { name: "Track A0"; type: "audio" }
    }

    ListModel {
        id: timelineClipsModel
        // Initial mock clips
        ListElement {
            trackIndex: 0
            type: "color"
            source: "blue"
            name: "Blue Gen"
            startFrame: 0
            durationFrames: 120
        }
        ListElement {
            trackIndex: 1
            type: "color"
            source: "black"
            name: "Master Audio"
            startFrame: 30
            durationFrames: 180
        }
    }

    function snapFrame(targetFrame, dragClipIndex) {
        var snapThresholdFrames = Math.max(1, Math.round(15 / zoomFactor));
        
        // 1. Snap to playhead
        var playheadFrame = engineBridge.currentFrame
        if (Math.abs(targetFrame - playheadFrame) <= snapThresholdFrames) {
            return playheadFrame;
        }
        
        // 2. Snap to other clips' start or end frame
        for (var i = 0; i < timelineClipsModel.count; ++i) {
            if (i === dragClipIndex) continue;
            var otherClip = timelineClipsModel.get(i);
            
            // Start frame
            if (Math.abs(targetFrame - otherClip.startFrame) <= snapThresholdFrames) {
                return otherClip.startFrame;
            }
            // End frame
            var otherEndFrame = otherClip.startFrame + otherClip.durationFrames;
            if (Math.abs(targetFrame - otherEndFrame) <= snapThresholdFrames) {
                return otherEndFrame;
            }
            
            // Snapping dragging end to other's start/end
            if (dragClipIndex !== -1 && dragClipIndex < timelineClipsModel.count) {
                var draggingDuration = timelineClipsModel.get(dragClipIndex).durationFrames;
                if (Math.abs((targetFrame + draggingDuration) - otherClip.startFrame) <= snapThresholdFrames) {
                    return otherClip.startFrame - draggingDuration;
                }
                if (Math.abs((targetFrame + draggingDuration) - otherEndFrame) <= snapThresholdFrames) {
                    return otherEndFrame - draggingDuration;
                }
            }
        }
        return targetFrame;
    }

    Connections {
        target: engineBridge
        function onFrameRendered(path) {
            frameSource = "file:///" + path + "?t=" + Date.now();
            appStatus = engineBridge.isPlaying 
                ? "Status: Playing... Frame " + engineBridge.currentFrame
                : "Status: Stopped at Frame " + engineBridge.currentFrame;
        }
        function onPlaybackStateChanged(isPlaying) {
            appStatus = isPlaying 
                ? "Status: Playing..." 
                : "Status: Paused";
        }
        function onTimelineInfoUpdated(info) {
            console.log("[QML] Timeline info: " + info);
        }
        function onAutoCutCompleted(cuts) {
            logModel.append({
                "level": 2,
                "levelName": "INFO",
                "color": "#58a6ff",
                "message": "[QML] AI Auto-Cut completed. Slices: " + cuts.join(", ")
            });
            appStatus = "Status: AI cut complete (" + (cuts.length + 1) + " shots)";
        }
    }

    Connections {
        target: logBridge
        function onLogReceived(level, message) {
            // Apply level filtering
            var minLevel = levelFilter.currentValue;
            if (minLevel !== undefined && minLevel !== -1 && level < minLevel)
                return;

            // Apply text filtering
            var searchTxt = searchBar.text.trim().toLowerCase();
            if (searchTxt !== "" && message.toLowerCase().indexOf(searchTxt) === -1)
                return;

            // Clean message endings
            var cleanMsg = message;
            if (cleanMsg.endsWith("\n")) cleanMsg = cleanMsg.slice(0, -1);
            if (cleanMsg.endsWith("\r")) cleanMsg = cleanMsg.slice(0, -1);

            logModel.append({
                "level": level,
                "levelName": getLevelName(level),
                "color": getLevelColor(level),
                "message": cleanMsg
            });

            // Prevent memory buildup
            if (logModel.count > 500) {
                logModel.remove(0);
            }
            
            if (autoScrollCheckBox.checked) {
                logListView.positionViewAtEnd();
            }
        }
    }

    // Helper functions for severity logging
    function getLevelColor(level) {
        switch(level) {
            case 0: return "#777777"; // TRACE
            case 1: return "#8b949e"; // DEBUG
            case 2: return "#58a6ff"; // INFO
            case 3: return "#d29922"; // WARNING
            case 4: return "#f85149"; // ERROR
            case 5: return "#ff7b72"; // CRITICAL
            default: return "#e0e0e0";
        }
    }

    function getLevelName(level) {
        switch(level) {
            case 0: return "TRACE";
            case 1: return "DEBUG";
            case 2: return "INFO";
            case 3: return "WARN";
            case 4: return "ERROR";
            case 5: return "CRIT";
            default: return "LOG";
        }
    }

    // Main layout containing split views
    SplitView {
        id: mainSplit
        anchors.fill: parent
        orientation: Qt.Horizontal

        // Left Panel: Properties / Compositing controls
        Rectangle {
            id: propertiesPanel
            SplitView.preferredWidth: 320
            SplitView.minimumWidth: 260
            color: "#1e1e1e"
            border.color: "#2d2d2d"
            border.width: 1

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 15
                spacing: 12

                // Header
                RowLayout {
                    Layout.fillWidth: true
                    Label {
                        text: "Compositing & Transform"
                        font.pixelSize: 14
                        font.bold: true
                        color: "#007acc"
                        Layout.fillWidth: true
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    height: 1
                    color: "#2d2d2d"
                }

                // Scrollable properties area
                ScrollView {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true

                    ColumnLayout {
                        width: parent.width - 10
                        spacing: 15

                        // 1. Transform Section
                        Label {
                            text: "TRANSFORM"
                            font.bold: true
                            font.pixelSize: 10
                            color: "#888888"
                        }

                        // Scale Slider
                        ColumnLayout {
                            Layout.fillWidth: true
                            RowLayout {
                                Layout.fillWidth: true
                                Label { text: "Scale"; color: "#e0e0e0" }
                                Spacer {}
                                Label { text: scaleValue.toFixed(2) + "x"; color: "#888888" }
                            }
                            Slider {
                                Layout.fillWidth: true
                                from: 0.1
                                to: 5.0
                                value: scaleValue
                                onMoved: scaleValue = value
                                background: Rectangle {
                                    height: 4
                                    radius: 2
                                    color: "#2d2d2d"
                                    Rectangle {
                                        width: parent.width * parent.parent.visualPosition
                                        height: parent.height
                                        color: "#007acc"
                                        radius: 2
                                    }
                                }
                                handle: Rectangle {
                                    x: parent.leftPadding + parent.visualPosition * (parent.availableWidth - width)
                                    y: parent.topPadding + parent.availableHeight / 2 - height / 2
                                    width: 14; height: 14; radius: 7
                                    color: parent.pressed ? "#0098ff" : "#007acc"
                                }
                            }
                        }

                        // Position X
                        ColumnLayout {
                            Layout.fillWidth: true
                            RowLayout {
                                Layout.fillWidth: true
                                Label { text: "Position X"; color: "#e0e0e0" }
                                Spacer {}
                                Label { text: posXValue + " px"; color: "#888888" }
                            }
                            Slider {
                                Layout.fillWidth: true
                                from: -1000
                                to: 1000
                                value: posXValue
                                onMoved: posXValue = value
                                background: Rectangle {
                                    height: 4; radius: 2; color: "#2d2d2d"
                                    Rectangle {
                                        width: parent.width * parent.parent.visualPosition
                                        height: parent.height
                                        color: "#007acc"
                                        radius: 2
                                    }
                                }
                                handle: Rectangle {
                                    x: parent.leftPadding + parent.visualPosition * (parent.availableWidth - width)
                                    y: parent.topPadding + parent.availableHeight / 2 - height / 2
                                    width: 14; height: 14; radius: 7
                                    color: parent.pressed ? "#0098ff" : "#007acc"
                                }
                            }
                        }

                        // Position Y
                        ColumnLayout {
                            Layout.fillWidth: true
                            RowLayout {
                                Layout.fillWidth: true
                                Label { text: "Position Y"; color: "#e0e0e0" }
                                Spacer {}
                                Label { text: posYValue + " px"; color: "#888888" }
                            }
                            Slider {
                                Layout.fillWidth: true
                                from: -1000
                                to: 1000
                                value: posYValue
                                onMoved: posYValue = value
                                background: Rectangle {
                                    height: 4; radius: 2; color: "#2d2d2d"
                                    Rectangle {
                                        width: parent.width * parent.parent.visualPosition
                                        height: parent.height
                                        color: "#007acc"
                                        radius: 2
                                    }
                                }
                                handle: Rectangle {
                                    x: parent.leftPadding + parent.visualPosition * (parent.availableWidth - width)
                                    y: parent.topPadding + parent.availableHeight / 2 - height / 2
                                    width: 14; height: 14; radius: 7
                                    color: parent.pressed ? "#0098ff" : "#007acc"
                                }
                            }
                        }

                        // Crop Slider
                        ColumnLayout {
                            Layout.fillWidth: true
                            RowLayout {
                                Layout.fillWidth: true
                                Label { text: "Crop Border"; color: "#e0e0e0" }
                                Spacer {}
                                Label { text: cropValue + " %"; color: "#888888" }
                            }
                            Slider {
                                Layout.fillWidth: true
                                from: 0
                                to: 100
                                value: cropValue
                                onMoved: cropValue = value
                                background: Rectangle {
                                    height: 4; radius: 2; color: "#2d2d2d"
                                    Rectangle {
                                        width: parent.width * parent.parent.visualPosition
                                        height: parent.height
                                        color: "#007acc"
                                        radius: 2
                                    }
                                }
                                handle: Rectangle {
                                    x: parent.leftPadding + parent.visualPosition * (parent.availableWidth - width)
                                    y: parent.topPadding + parent.availableHeight / 2 - height / 2
                                    width: 14; height: 14; radius: 7
                                    color: parent.pressed ? "#0098ff" : "#007acc"
                                }
                            }
                        }

                        Rectangle {
                            Layout.fillWidth: true; height: 1; color: "#2d2d2d"
                        }

                        // 2. Compositing Section
                        Label {
                            text: "COMPOSITING"
                            font.bold: true; font.pixelSize: 10; color: "#888888"
                        }

                        // Blend Modes Dropdown
                        ColumnLayout {
                            Layout.fillWidth: true
                            Label { text: "Blend Mode"; color: "#e0e0e0" }
                            ComboBox {
                                Layout.fillWidth: true
                                model: ["Normal", "Add", "Multiply", "Screen", "Overlay"]
                                currentIndex: 0
                                onActivated: blendMode = currentText
                                background: Rectangle {
                                    color: "#2d2d2d"
                                    border.color: "#3f3f3f"
                                    radius: 4
                                }
                                contentItem: Label {
                                    text: parent.displayText
                                    color: "#ffffff"
                                    verticalAlignment: Label.AlignVCenter
                                    leftPadding: 10
                                }
                            }
                        }

                        // GPU & NPU Toggles
                        RowLayout {
                            Layout.fillWidth: true
                            Label { text: "NPU (DirectML) AI Acceleration"; color: "#e0e0e0"; Layout.fillWidth: true }
                            Switch {
                                checked: npuProcessing
                                onCheckedChanged: {
                                    npuProcessing = checked;
                                    logModel.append({
                                        "level": 2,
                                        "levelName": "INFO",
                                        "color": "#58a6ff",
                                        "message": "[QML] NPU Processing state changed: " + checked
                                    });
                                }
                            }
                        }

                        RowLayout {
                            Layout.fillWidth: true
                            Label { text: "GPU hardware decoding"; color: "#e0e0e0"; Layout.fillWidth: true }
                            Switch {
                                checked: gpuAcceleration
                                onCheckedChanged: {
                                    gpuAcceleration = checked;
                                    logModel.append({
                                        "level": 2,
                                        "levelName": "INFO",
                                        "color": "#58a6ff",
                                        "message": "[QML] GPU Acceleration state changed: " + checked
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // Right Main Area: Split View Vertical (Monitor + Timeline & Logs)
        SplitView {
            id: rightSplit
            orientation: Qt.Vertical
            SplitView.fillWidth: true
            SplitView.fillHeight: true

            // Top Panel: Media Bin & Playback Monitor Split
            SplitView {
                SplitView.preferredHeight: 380
                SplitView.fillWidth: true
                orientation: Qt.Horizontal

                // Media Bin Panel
                Rectangle {
                    SplitView.preferredWidth: 320
                    SplitView.minimumWidth: 200
                    color: "#1e1e1e"
                    border.color: "#2d2d2d"
                    border.width: 1

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 8

                        Label {
                            text: "Media Bin"
                            font.bold: true
                            color: "#007acc"
                        }

                        // Grid of Media items
                        GridView {
                            id: mediaBinGrid
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            cellWidth: 100
                            cellHeight: 90
                            clip: true

                            model: ListModel {
                                id: mediaBinModel
                                ListElement { type: "avformat"; source: "D:/209400.mp4"; name: "209400.mp4"; colorStr: "#203c54" }
                                ListElement { type: "color"; source: "red"; name: "Red Gen"; colorStr: "#bd2c00" }
                                ListElement { type: "color"; source: "blue"; name: "Blue Gen"; colorStr: "#007acc" }
                                ListElement { type: "color"; source: "green"; name: "Green Gen"; colorStr: "#28a745" }
                                ListElement { type: "color"; source: "black"; name: "Black Gen"; colorStr: "#1f2328" }
                            }

                            delegate: Item {
                                width: 90
                                height: 80

                                Item {
                                    id: dragWrapper
                                    width: 80
                                    height: 70
                                    anchors.centerIn: parent

                                    Rectangle {
                                        id: visualItem
                                        width: 80
                                        height: 70
                                        color: model.colorStr
                                        border.color: dragMouseArea.drag.active ? "#0098ff" : "#2d2d2d"
                                        border.width: dragMouseArea.drag.active ? 2 : 1
                                        radius: 4

                                        Drag.active: dragMouseArea.drag.active
                                        Drag.keys: [ "clip-drop" ]
                                        property string clipType: model.type
                                        property string clipSource: model.source
                                        property string clipName: model.name

                                        states: [
                                            State {
                                                when: dragMouseArea.drag.active
                                                ParentChange {
                                                    target: visualItem
                                                    parent: root.contentItem
                                                }
                                                AnchorChanges {
                                                    target: visualItem
                                                    anchors.horizontalCenter: undefined
                                                    anchors.verticalCenter: undefined
                                                }
                                            }
                                        ]

                                        ColumnLayout {
                                            anchors.fill: parent
                                            anchors.margins: 4
                                            spacing: 2
                                            
                                            Rectangle {
                                                Layout.fillWidth: true
                                                Layout.preferredHeight: 35
                                                color: "#0a0a0a"
                                                radius: 2
                                                Label {
                                                    text: model.type === "avformat" ? "🎬 Video" : "🎨 Color"
                                                    font.pixelSize: 10
                                                    color: "#888888"
                                                    anchors.centerIn: parent
                                                }
                                            }

                                            Label {
                                                text: model.name
                                                color: "#ffffff"
                                                font.pixelSize: 10
                                                font.bold: true
                                                horizontalAlignment: Text.AlignHCenter
                                                Layout.fillWidth: true
                                                elide: Text.ElideRight
                                            }
                                        }

                                        MouseArea {
                                            id: dragMouseArea
                                            anchors.fill: parent
                                            drag.target: visualItem

                                            onReleased: {
                                                visualItem.parent = dragWrapper
                                                visualItem.x = 0
                                                visualItem.y = 0
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Playback Monitor Panel
                Rectangle {
                    SplitView.fillWidth: true
                    color: "#1e1e1e"

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 8

                        // Title
                        RowLayout {
                            Layout.fillWidth: true
                            Label {
                                text: "Playback Monitor"
                                font.bold: true
                                color: "#007acc"
                                Layout.fillWidth: true
                            }
                            Label {
                                text: activeClipName
                                color: "#888888"
                                font.italic: true
                            }
                        }

                        // Canvas viewport frame
                        Rectangle {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            color: "#090909"
                            border.color: "#2d2d2d"
                            border.width: 1
                            radius: 4
                            clip: true

                            Image {
                                id: monitorImage
                                anchors.fill: parent
                                anchors.margins: 5
                                fillMode: Image.PreserveAspectFit
                                source: frameSource !== "" ? frameSource : ""
                                asynchronous: true
                                
                                Rectangle {
                                    anchors.fill: parent
                                    color: "transparent"
                                    visible: monitorImage.status !== Image.Ready
                                    ColumnLayout {
                                        anchors.centerIn: parent
                                        spacing: 8
                                        Label {
                                            text: "Active Playback Loop running..."
                                            color: "#888888"
                                            font.bold: true
                                            font.pixelSize: 13
                                        }
                                        Label {
                                            text: "[Rendering frame pipeline via MLT core]"
                                            color: "#5c5c5c"
                                            font.pixelSize: 11
                                        }
                                    }
                                }
                            }
                        }

                        // Progress Slider
                        Slider {
                            id: progressSlider
                            Layout.fillWidth: true
                            from: 0
                            to: 150
                            value: engineBridge.currentFrame
                            
                            onMoved: {
                                engineBridge.currentFrame = value;
                                if (!engineBridge.isPlaying) {
                                    engineBridge.handleExportFrame(value, "exported_frame.ppm");
                                }
                            }

                            background: Rectangle {
                                height: 6; radius: 3; color: "#151515"
                                Rectangle {
                                    width: parent.width * parent.parent.visualPosition
                                    height: parent.height
                                    color: "#007acc"
                                    radius: 3
                                }
                            }
                            handle: Rectangle {
                                x: parent.leftPadding + parent.visualPosition * (parent.availableWidth - width)
                                y: parent.topPadding + parent.availableHeight / 2 - height / 2
                                width: 14; height: 14; radius: 7
                                color: parent.pressed ? "#0098ff" : "#007acc"
                                border.color: "#0098ff"
                                border.width: 1
                            }
                        }

                        // Playback Toolbar Controls
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 10

                            Button {
                                text: "Play"
                                enabled: !engineBridge.isPlaying
                                onClicked: {
                                    engineBridge.handlePlay();
                                }
                                background: Rectangle {
                                    color: parent.enabled ? (parent.hovered ? "#383838" : "#2d2d2d") : "#1a1a1a"
                                    border.color: "#3f3f3f"
                                    radius: 4
                                }
                                contentItem: Label {
                                    text: parent.text
                                    color: parent.enabled ? "#ffffff" : "#5c5c5c"
                                    horizontalAlignment: Label.AlignHCenter
                                    verticalAlignment: Label.AlignVCenter
                                }
                            }

                            Button {
                                text: "Pause"
                                enabled: engineBridge.isPlaying
                                onClicked: {
                                    engineBridge.handlePause();
                                }
                                background: Rectangle {
                                    color: parent.enabled ? (parent.hovered ? "#383838" : "#2d2d2d") : "#1a1a1a"
                                    border.color: "#3f3f3f"
                                    radius: 4
                                }
                                contentItem: Label {
                                    text: parent.text
                                    color: parent.enabled ? "#ffffff" : "#5c5c5c"
                                    horizontalAlignment: Label.AlignHCenter
                                    verticalAlignment: Label.AlignVCenter
                                }
                            }

                            Button {
                                text: "Export Frame"
                                onClicked: {
                                    engineBridge.handleExportFrame(engineBridge.currentFrame, "exported_frame.ppm");
                                }
                                background: Rectangle {
                                    color: parent.hovered ? "#383838" : "#2d2d2d"
                                    border.color: "#3f3f3f"
                                    radius: 4
                                }
                                contentItem: Label {
                                    text: parent.text
                                    color: "#ffffff"
                                    horizontalAlignment: Label.AlignHCenter
                                    verticalAlignment: Label.AlignVCenter
                                }
                            }

                            Spacer {}

                            Label {
                                text: appStatus
                                color: "#ffffff"
                                font.bold: true
                            }
                        }
                    }
                }
            }

            // Bottom Panel: Timeline & Diagnostics Split
            SplitView {
                orientation: Qt.Vertical
                SplitView.fillHeight: true
                SplitView.fillWidth: true

                // Multitrack Timeline
                Rectangle {
                    SplitView.preferredHeight: 180
                    color: "#151515"

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 8

                        RowLayout {
                            Layout.fillWidth: true
                            Label {
                                text: "Multitrack Timeline"
                                font.bold: true
                                color: "#007acc"
                                Layout.fillWidth: true
                            }

                            // Zoom controls
                            Label { text: "Zoom:"; color: "#888888" }
                            Slider {
                                id: zoomSlider
                                from: 0.2
                                to: 5.0
                                value: zoomFactor
                                onMoved: zoomFactor = value
                                background: Rectangle {
                                    implicitWidth: 100; height: 4; radius: 2; color: "#2d2d2d"
                                    Rectangle {
                                        width: parent.width * parent.parent.visualPosition
                                        height: parent.height; color: "#007acc"; radius: 2
                                    }
                                }
                                handle: Rectangle {
                                    x: parent.leftPadding + parent.visualPosition * (parent.availableWidth - width)
                                    y: parent.topPadding + parent.availableHeight / 2 - height / 2
                                    width: 10; height: 10; radius: 5; color: "#007acc"
                                }
                            }

                            Button {
                                text: "Auto-Cut (AI)"
                                background: Rectangle {
                                    color: "#007acc"
                                    radius: 4
                                }
                                contentItem: Label {
                                    text: "Auto-Cut (AI)"
                                    color: "#ffffff"
                                    font.bold: true
                                    horizontalAlignment: Label.AlignHCenter
                                    verticalAlignment: Label.AlignVCenter
                                }
                                onClicked: {
                                    appStatus = "Status: Analyzing (AI)...";
                                    engineBridge.handleAutoCut(0);
                                }
                            }
                            Button {
                                text: "Import Clip"
                                background: Rectangle {
                                    color: "#007acc"
                                    radius: 4
                                }
                                contentItem: Label {
                                    text: "Import Clip"
                                    color: "#ffffff"
                                    font.bold: true
                                    horizontalAlignment: Label.AlignHCenter
                                    verticalAlignment: Label.AlignVCenter
                                }
                                onClicked: {
                                    activeClipName = "209400.mp4";
                                    activeClipPath = "D:/209400.mp4";
                                    var insertPos = engineBridge.currentFrame;
                                    var success = engineBridge.handleInsertClip("avformat", activeClipPath, 0, insertPos);
                                    if (success) {
                                        timelineClipsModel.append({
                                            "trackIndex": 0,
                                            "type": "avformat",
                                            "source": activeClipPath,
                                            "name": activeClipName,
                                            "startFrame": insertPos,
                                            "durationFrames": 150
                                        });
                                        logModel.append({
                                            "level": 2,
                                            "levelName": "INFO",
                                            "color": "#58a6ff",
                                            "message": "[GUI] User imported and inserted media file: D:/209400.mp4 at frame " + insertPos
                                        });
                                    }
                                }
                            }
                        }

                        // Interactive Timeline Workspace
                        RowLayout {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            spacing: 0

                            // 1. Track Headers Column (Fixed Width)
                            ColumnLayout {
                                Layout.preferredWidth: 100
                                Layout.fillHeight: true
                                spacing: 4

                                // Top Spacer matching the Time Ruler height
                                Item {
                                    Layout.preferredHeight: 25
                                    Layout.fillWidth: true
                                }

                                Repeater {
                                    model: trackModel
                                    delegate: Rectangle {
                                        Layout.fillWidth: true
                                        Layout.preferredHeight: 50
                                        color: "#1a1a1a"
                                        border.color: "#282828"
                                        radius: 4
                                        Label {
                                            text: model.name
                                            color: "#e0e0e0"
                                            font.bold: true
                                            font.pixelSize: 11
                                            anchors.centerIn: parent
                                        }
                                    }
                                }
                                
                                Spacer {}
                            }

                            // 2. Scrollable Timeline Track Lane Viewport
                            Flickable {
                                id: timelineFlickable
                                Layout.fillWidth: true
                                Layout.fillHeight: true
                                clip: true
                                contentWidth: Math.max(width, timelineDurationFrames * zoomFactor)
                                contentHeight: trackModel.count * 54 + 30
                                
                                ScrollBar.horizontal: ScrollBar {
                                    policy: ScrollBar.AlwaysVisible
                                    active: true
                                }

                                Rectangle {
                                    id: trackContainer
                                    width: timelineFlickable.contentWidth
                                    height: timelineFlickable.contentHeight
                                    color: "transparent"

                                    ColumnLayout {
                                        anchors.fill: parent
                                        spacing: 4

                                        // Time Ruler (Canvas)
                                        Canvas {
                                            id: timeRuler
                                            Layout.fillWidth: true
                                            Layout.preferredHeight: 25
                                            
                                            onPaint: {
                                                var ctx = getContext("2d")
                                                ctx.clearRect(0, 0, width, height)
                                                ctx.strokeStyle = "#444444"
                                                ctx.fillStyle = "#888888"
                                                ctx.font = "9px Consolas"
                                                ctx.lineWidth = 1
                                                
                                                var frameStep = 30
                                                if (zoomFactor < 0.5) frameStep = 150
                                                if (zoomFactor < 0.2) frameStep = 300
                                                if (zoomFactor > 2.0) frameStep = 10
                                                
                                                for (var f = 0; f * zoomFactor < width; f += frameStep) {
                                                    var x = f * zoomFactor
                                                    ctx.beginPath()
                                                    ctx.moveTo(x, height)
                                                    if (f % (frameStep * 5) === 0) {
                                                        ctx.lineTo(x, height - 12)
                                                        var totalSecs = Math.floor(f / 30)
                                                        var frames = f % 30
                                                        var mins = Math.floor(totalSecs / 60)
                                                        var secs = totalSecs % 60
                                                        var tc = (mins < 10 ? "0" : "") + mins + ":" + (secs < 10 ? "0" : "") + secs + ":" + (frames < 10 ? "0" : "") + frames
                                                        ctx.fillText(tc, x + 3, 10)
                                                    } else {
                                                        ctx.lineTo(x, height - 6)
                                                    }
                                                    ctx.stroke()
                                                }
                                            }

                                            Connections {
                                                target: root
                                                function onZoomFactorChanged() {
                                                    timeRuler.requestPaint()
                                                }
                                            }

                                            // Playhead scrubbing
                                            MouseArea {
                                                anchors.fill: parent
                                                onPressed: {
                                                    var frame = Math.round(mouse.x / zoomFactor)
                                                    if (frame < 0) frame = 0
                                                    engineBridge.currentFrame = frame
                                                    if (!engineBridge.isPlaying) {
                                                        engineBridge.handleExportFrame(frame, "exported_frame.ppm")
                                                    }
                                                }
                                                onPositionChanged: {
                                                    if (pressed) {
                                                        var frame = Math.round(mouse.x / zoomFactor)
                                                        if (frame < 0) frame = 0
                                                        engineBridge.currentFrame = frame
                                                        if (!engineBridge.isPlaying) {
                                                            engineBridge.handleExportFrame(frame, "exported_frame.ppm")
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        // Lanes for tracks
                                        Repeater {
                                            model: trackModel
                                            delegate: TimelineTrack {
                                                trackIdx: index
                                                trackName: model.name
                                                Layout.fillWidth: true
                                                Layout.preferredHeight: 50
                                            }
                                        }
                                        
                                        Spacer {}
                                    }

                                    // Playhead Vertical Line overlay
                                    Rectangle {
                                        id: playheadLine
                                        x: engineBridge.currentFrame * zoomFactor
                                        width: 2
                                        anchors.top: parent.top
                                        anchors.bottom: parent.bottom
                                        color: "#ff3b30"
                                        z: 20

                                        Rectangle {
                                            width: 10
                                            height: 10
                                            color: "#ff3b30"
                                            radius: 5
                                            anchors.horizontalCenter: parent.horizontalCenter
                                            anchors.top: parent.top
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Diagnostics Log Console Drawer
                Rectangle {
                    SplitView.preferredHeight: 180
                    SplitView.fillHeight: true
                    color: "#121212"
                    border.color: "#2d2d2d"
                    border.width: 1

                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 8
                        spacing: 8

                        // Console Toolbar
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 10

                            Label { text: "Diagnostics Log Console"; font.bold: true; color: "#007acc" }
                            
                            Spacer {}

                            Label { text: "Level:"; color: "#888888" }
                            ComboBox {
                                id: levelFilter
                                textRole: "text"
                                valueRole: "value"
                                model: [
                                    { text: "All Levels", value: -1 },
                                    { text: "Trace & Above", value: 0 },
                                    { text: "Debug & Above", value: 1 },
                                    { text: "Info & Above", value: 2 },
                                    { text: "Warning & Above", value: 3 },
                                    { text: "Error & Above", value: 4 },
                                    { text: "Critical Only", value: 5 }
                                ]
                                currentIndex: 3 // Info & Above
                                onActivated: logModel.clear()
                                background: Rectangle { color: "#2d2d2d"; radius: 4 }
                                contentItem: Label {
                                    text: parent.displayText
                                    color: "#ffffff"
                                    verticalAlignment: Label.AlignVCenter
                                    leftPadding: 8
                                }
                            }

                            TextField {
                                id: searchBar
                                placeholderText: "Filter logs by text..."
                                selectByMouse: true
                                color: "#ffffff"
                                placeholderTextColor: "#666666"
                                background: Rectangle {
                                    color: "#2d2d2d"
                                    border.color: "#3f3f3f"
                                    radius: 4
                                }
                                onTextChanged: logModel.clear()
                            }

                            Button {
                                text: "Clear"
                                background: Rectangle { color: "#2d2d2d"; radius: 4 }
                                contentItem: Label { text: "Clear"; color: "#ffffff"; horizontalAlignment: Label.AlignHCenter }
                                onClicked: logModel.clear()
                            }

                            CheckBox {
                                id: autoScrollCheckBox
                                text: "Auto-Scroll"
                                checked: true
                                contentItem: Label {
                                    text: "Auto-Scroll"
                                    color: "#ffffff"
                                    leftPadding: 24
                                    verticalAlignment: Label.AlignVCenter
                                }
                            }
                        }

                        // Logs List View viewport
                        Rectangle {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            color: "#0b0b0b"
                            border.color: "#282828"
                            radius: 4

                            ListView {
                                id: logListView
                                anchors.fill: parent
                                anchors.margins: 8
                                clip: true
                                model: ListModel { id: logModel }
                                delegate: RowLayout {
                                    width: logListView.width
                                    spacing: 10
                                    Label {
                                        text: "[" + levelName + "]"
                                        color: model.color
                                        font.family: "Consolas"
                                        font.pixelSize: 11
                                    }
                                    Label {
                                        text: message
                                        color: "#e0e0e0"
                                        font.family: "Consolas"
                                        font.pixelSize: 11
                                        Layout.fillWidth: true
                                        wrapMode: Text.WrapAnywhere
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// Custom VideoClip QML Component
component VideoClip : Rectangle {
    id: clipRect
    property int trackIndex
    property int clipIndex
    property int startFrame
    property int durationFrames
    property string clipType
    property string clipSource
    property string clipName
    
    x: startFrame * zoomFactor
    width: durationFrames * zoomFactor
    height: parent.height - 4
    y: 2
    color: clipType === "avformat" ? "#1a365d" : "#2a4365"
    border.color: clipDragArea.pressed ? "#0098ff" : "#2b6cb0"
    border.width: 1
    radius: 4
    clip: true
    
    // Waveform / Thumbnails decoration:
    // Stylized waveform inside the clip!
    Row {
        anchors.fill: parent
        anchors.leftMargin: 10
        anchors.rightMargin: 10
        anchors.topMargin: 5
        anchors.bottomMargin: 5
        spacing: 2
        opacity: 0.25
        
        Repeater {
            model: Math.max(1, Math.floor(clipRect.width / 5))
            delegate: Rectangle {
                width: 3
                // Random height based on index to look like a waveform
                height: (Math.sin(index * 0.5) * 0.4 + 0.6) * parent.height
                color: "#72b2e8"
                radius: 1
                anchors.verticalCenter: parent.verticalCenter
            }
        }
    }
    
    // Title of the clip
    Label {
        text: clipName
        color: "#ffffff"
        font.pixelSize: 11
        font.bold: true
        anchors.left: parent.left
        anchors.leftMargin: 12
        anchors.top: parent.top
        anchors.topMargin: 4
    }
    
    Label {
        text: Math.round(durationFrames / 30) + "s"
        color: "#a0aec0"
        font.pixelSize: 9
        anchors.left: parent.left
        anchors.leftMargin: 12
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 4
    }

    // Drag handle left
    Rectangle {
        id: leftTrimHandle
        width: 8
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        color: leftTrimMouse.containsMouse || leftTrimMouse.pressed ? "#0098ff" : "#2b6cb0"
        opacity: 0.8
        radius: 2
        
        MouseArea {
            id: leftTrimMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.SizeHorCursor
            
            property int lastX: 0
            
            onPressed: {
                lastX = mapToItem(trackContainer, mouse.x, mouse.y).x
            }
            
            onPositionChanged: {
                if (pressed) {
                    var currentX = mapToItem(trackContainer, mouse.x, mouse.y).x
                    var deltaX = currentX - lastX
                    var deltaFrames = Math.round(deltaX / zoomFactor)
                    if (deltaFrames !== 0) {
                        var newStart = startFrame + deltaFrames
                        var endFrame = startFrame + durationFrames
                        if (newStart < 0) newStart = 0
                        if (endFrame - newStart < 5) {
                            newStart = endFrame - 5
                        }
                        
                        timelineClipsModel.setProperty(clipIndex, "startFrame", newStart)
                        timelineClipsModel.setProperty(clipIndex, "durationFrames", endFrame - newStart)
                        lastX = newStart * zoomFactor
                    }
                }
            }
        }
    }

    // Drag handle right
    Rectangle {
        id: rightTrimHandle
        width: 8
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        color: rightTrimMouse.containsMouse || rightTrimMouse.pressed ? "#0098ff" : "#2b6cb0"
        opacity: 0.8
        radius: 2
        
        MouseArea {
            id: rightTrimMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.SizeHorCursor
            
            property int lastX: 0
            
            onPressed: {
                lastX = mapToItem(trackContainer, mouse.x, mouse.y).x
            }
            
            onPositionChanged: {
                if (pressed) {
                    var currentX = mapToItem(trackContainer, mouse.x, mouse.y).x
                    var deltaX = currentX - lastX
                    var deltaFrames = Math.round(deltaX / zoomFactor)
                    if (deltaFrames !== 0) {
                        var newDuration = durationFrames + deltaFrames
                        if (newDuration < 5) newDuration = 5
                        
                        timelineClipsModel.setProperty(clipIndex, "durationFrames", newDuration)
                        lastX = (startFrame + newDuration) * zoomFactor
                    }
                }
            }
        }
    }

    // Main body drag area
    MouseArea {
        id: clipDragArea
        anchors.fill: parent
        anchors.leftMargin: 8
        anchors.rightMargin: 8
        
        property int lastX: 0
        property int dragOffset: 0
        
        onPressed: {
            var pressX = mapToItem(trackContainer, mouse.x, mouse.y).x
            dragOffset = pressX - (startFrame * zoomFactor)
            lastX = pressX
            clipRect.z = 10
        }
        
        onPositionChanged: {
            if (pressed) {
                var currentX = mapToItem(trackContainer, mouse.x, mouse.y).x
                var proposedX = currentX - dragOffset
                var proposedFrame = Math.round(proposedX / zoomFactor)
                if (proposedFrame < 0) proposedFrame = 0
                
                proposedFrame = snapFrame(proposedFrame, clipIndex)
                
                timelineClipsModel.setProperty(clipIndex, "startFrame", proposedFrame)
            }
        }
        
        onReleased: {
            clipRect.z = 1
            logModel.append({
                "level": 2,
                "levelName": "INFO",
                "color": "#58a6ff",
                "message": "[GUI] Moved clip '" + clipName + "' to frame " + startFrame
            })
        }
    }
}

// Custom TimelineTrack QML Component
component TimelineTrack : Rectangle {
    id: trackLane
    property int trackIdx
    property string trackName
    
    height: 50
    color: "#1a1a1a"
    border.color: "#282828"
    border.width: 1
    
    // Grid Lines for ticks
    Row {
        anchors.fill: parent
        spacing: 30 * zoomFactor
        Repeater {
            model: Math.ceil(trackLane.width / (30 * zoomFactor))
            delegate: Rectangle {
                width: 1
                height: parent.height
                color: "#222222"
            }
        }
    }

    // Render clips in this track
    Repeater {
        model: timelineClipsModel
        delegate: VideoClip {
            visible: model.trackIndex === trackIdx
            trackIndex: model.trackIndex
            clipIndex: index
            startFrame: model.startFrame
            durationFrames: model.durationFrames
            clipType: model.type
            clipSource: model.source
            clipName: model.name
        }
    }

    // Drop Preview ghost footprint
    Rectangle {
        id: dropPreview
        visible: trackDropArea.dragActive
        x: trackDropArea.hoverFrame * zoomFactor
        width: 150 * zoomFactor
        height: parent.height - 4
        y: 2
        color: "#007acc"
        opacity: 0.4
        border.color: "#0098ff"
        border.width: 1
        radius: 4
    }

    DropArea {
        id: trackDropArea
        anchors.fill: parent
        keys: ["clip-drop"]
        
        property bool dragActive: containsDrag
        property int hoverFrame: 0
        
        onPositionChanged: {
            var localX = drag.x
            var proposedFrame = Math.round(localX / zoomFactor)
            if (proposedFrame < 0) proposedFrame = 0
            hoverFrame = snapFrame(proposedFrame, -1)
        }
        
        onDropped: {
            var type = drag.source.clipType
            var source = drag.source.clipSource
            var name = drag.source.clipName
            
            var success = engineBridge.handleInsertClip(type, source, trackIdx, hoverFrame)
            if (success) {
                timelineClipsModel.append({
                    "trackIndex": trackIdx,
                    "type": type,
                    "source": source,
                    "name": name,
                    "startFrame": hoverFrame,
                    "durationFrames": 150
                })
                
                logModel.append({
                    "level": 2,
                    "levelName": "INFO",
                    "color": "#58a6ff",
                    "message": "[GUI] Inserted clip '" + name + "' onto track " + trackIdx + " at frame " + hoverFrame
                })
            }
        }
    }
}

// Simple spacer helper
component Spacer : Item {
    Layout.fillWidth: true
    Layout.fillHeight: true
}
