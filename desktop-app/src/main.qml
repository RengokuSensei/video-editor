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

    // Force frame refresh by appending a timestamp to URL
    property string frameSource: ""
    property string appStatus: "Status: Idle"

    Connections {
        target: engineBridge
        function onFrameRendered(path) {
            frameSource = "file:///" + path + "?t=" + Date.now();
            appStatus = engineBridge.isPlaying() 
                ? "Status: Playing... Frame " + engineBridge.currentFrame()
                : "Status: Stopped at Frame " + engineBridge.currentFrame();
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

            // Top Panel: Playback Monitor
            Rectangle {
                SplitView.preferredHeight: 380
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
                            
                            // Placeholder when no source is loaded
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
                        value: engineBridge.currentFrame()
                        
                        // Prevent feedback loop while dragging
                        onMoved: {
                            if (!engineBridge.isPlaying()) {
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
                            enabled: !engineBridge.isPlaying()
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
                            enabled: engineBridge.isPlaying()
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
                                engineBridge.handleExportFrame(0, "exported_frame.ppm");
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
                                    // Simulated import
                                    activeClipName = "209400.mp4";
                                    activeClipPath = "D:/209400.mp4";
                                    engineBridge.handleAddClip("avformat", activeClipPath, 0);
                                    logModel.append({
                                        "level": 2,
                                        "levelName": "INFO",
                                        "color": "#58a6ff",
                                        "message": "[GUI] User imported media file: D:/209400.mp4"
                                    });
                                }
                            }
                        }

                        // Mock Tracks Layout
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 5

                            // Track 1: Video V0
                            RowLayout {
                                Layout.fillWidth: true
                                height: 40
                                Rectangle {
                                    width: 80; height: 35; color: "#222222"
                                    border.color: "#333333"
                                    radius: 3
                                    Label {
                                        text: "Track V0"; color: "#888888"
                                        anchors.centerIn: parent
                                    }
                                }
                                Rectangle {
                                    Layout.fillWidth: true; height: 35; color: "#203c54"
                                    border.color: "#284e6c"; radius: 3
                                    Label {
                                        text: activeClipPath !== "" 
                                            ? " [00:00 - 05:00] Base Track | Active Clip: " + activeClipName 
                                            : " [00:00 - 05:00] Color Clip [Blue]"
                                        color: "#72b2e8"
                                        anchors.left: parent.left
                                        anchors.leftMargin: 15
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                }
                            }

                            // Track 2: Audio A0
                            RowLayout {
                                Layout.fillWidth: true
                                height: 40
                                Rectangle {
                                    width: 80; height: 35; color: "#222222"
                                    border.color: "#333333"
                                    radius: 3
                                    Label {
                                        text: "Track A0"; color: "#888888"
                                        anchors.centerIn: parent
                                    }
                                }
                                Rectangle {
                                    Layout.fillWidth: true; height: 35; color: "#1e2830"
                                    border.color: "#203c54"; radius: 3
                                    Label {
                                        text: " [00:00 - 05:00] Master Audio track"
                                        color: "#72b2e8"
                                        anchors.left: parent.left
                                        anchors.leftMargin: 15
                                        anchors.verticalCenter: parent.verticalCenter
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

// Simple spacer helper
component Spacer : Item {
    Layout.fillWidth: true
    Layout.fillHeight: true
}
