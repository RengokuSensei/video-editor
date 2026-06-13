#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include "UI_Engine_Bridge.h"
#include "LogConsoleWidget.h"
#include <QDebug>

int main(int argc, char *argv[]) {
    qDebug() << "===========================================";
    qDebug() << "Starting QML Qt6 video editor application";
    qDebug() << "===========================================";

    QGuiApplication app(argc, argv);
    
    // Initialize the logger bridge singleton
    QLogBridge& logBridge = QLogBridge::getInstance();

    UIEngineBridge bridge;

    QQmlApplicationEngine engine;
    
    // Register contexts so QML can access our C++ bindings
    engine.rootContext()->setContextProperty("engineBridge", &bridge);
    engine.rootContext()->setContextProperty("logBridge", &logBridge);

    const QUrl url(QStringLiteral("qrc:/main.qml"));
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreated,
                     &app, [url](QObject *obj, const QUrl &objUrl) {
        if (!obj && url == objUrl)
            QCoreApplication::exit(-1);
    }, Qt::QueuedConnection);
    engine.load(url);

    return app.exec();
}
