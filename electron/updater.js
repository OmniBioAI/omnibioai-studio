const { autoUpdater } = require('electron-updater');
const { dialog, app } = require('electron');

autoUpdater.logger = console;

function initAutoUpdater(mainWindow) {
  if (!app.isPackaged) return;

  function send(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  }

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    send('update-available', { version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('App is up to date');
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `OmniBioAI Studio ${info.version} has been downloaded.`,
      detail: 'Restart now to apply the update, or continue and restart later.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message);
    send('update-error', { message: err.message });
  });

  autoUpdater.checkForUpdatesAndNotify();
}

module.exports = { initAutoUpdater };
