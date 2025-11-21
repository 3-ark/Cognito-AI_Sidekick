import {
 strToU8, unzip,zip, 
} from 'fflate';
import localforage from 'localforage';

import storage from '../../background/storageUtil';

const exportData = async () => {
  try {
    const dataToExport: { [key: string]: any } = {};

    // 1. Get all data from localforage
    const keys = await localforage.keys();

    for (const key of keys) {
      dataToExport[key] = await localforage.getItem(key);
    }

    // 2. Get config from chrome.storage.local
    const config = await storage.getItem('config');

    if (config) {
      dataToExport['config'] = JSON.parse(config);
    }

    // 3. Create a zip file
    const zippedData = await new Promise<Uint8Array>((resolve, reject) => {
      const files: { [key: string]: Uint8Array } = {};

      for (const key in dataToExport) {
        files[key] = strToU8(JSON.stringify(dataToExport[key]));
      }

      zip(files, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    // 4. Trigger download
    const blob = new Blob([new Uint8Array(zippedData)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = `cognito_backup_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

  } catch (error) {
    console.error('Error exporting data:', error);
  }
};

const importData = () => {
  const input = document.createElement('input');

  input.type = 'file';
  input.accept = '.zip';
  input.onchange = async e => {
    const file = (e.target as HTMLInputElement).files?.[0];

    if (!file) return;

    try {
      // 1. Clear existing data
      await localforage.clear();
      await storage.deleteItem('config');

      // 2. Read and unzip the file
      const buffer = await file.arrayBuffer();
      const unzipped = await new Promise<{ [key: string]: Uint8Array }>((resolve, reject) => {
        unzip(new Uint8Array(buffer), (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        });
      });

      // 3. Import data
      for (const filename in unzipped) {
        const content = new TextDecoder().decode(unzipped[filename]);
        const data = JSON.parse(content);

        if (filename === 'config') {
          await storage.setItem('config', JSON.stringify(data));
        } else {
          await localforage.setItem(filename, data);
        }
      }

      // 4. Reload extension
      chrome.runtime.reload();

    } catch (error) {
      console.error('Error importing data:', error);
    }
  };
  input.click();
};

export { exportData, importData };
