const { app, BrowserWindow } = require('electron');
const path = require('path');
const startServer = require('./server');

let mainWindow;

function createWindow() {
    // Start the backend server
    startServer();

    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "Station ZIZ",
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Give the server a moment to start, then load the URL
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3001');
    }, 1500);

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
