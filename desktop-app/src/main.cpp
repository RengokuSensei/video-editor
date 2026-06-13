#include <QApplication>
#include "MainWindow.h"
#include <QDebug>

int main(int argc, char *argv[]) {
    qDebug() << "===========================================";
    qDebug() << "Starting native Qt6 video editor application";
    qDebug() << "===========================================";

    QApplication app(argc, argv);
    
    // Create and display the main window
    MainWindow window;
    window.show();

    return app.exec();
}
