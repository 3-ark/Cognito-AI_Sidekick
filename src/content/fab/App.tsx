import React, { useState, useEffect } from 'react';
import Fab from './Fab';
import Window from './Window';
import storage from '../../background/storageUtil';
import { Config } from '../../types/config';

const App: React.FC = () => {
  const [windowVisible, setWindowVisible] = useState(false);
  const [pageTitle, setPageTitle] = useState('');
  const [showButton, setShowButton] = useState(true);
  const [windowPosition, setWindowPosition] = useState<{ x: number; y: number } | undefined>(undefined);
  const [windowSize, setWindowSize] = useState({ width: 400, height: 600 });

  useEffect(() => {
    const fetchConfig = async () => {
      const storedConfig = await storage.getItem('config');
      if (storedConfig) {
        const config: Config = JSON.parse(storedConfig);
        setShowButton(config.showFloatingButton !== false);
        setWindowPosition(config.windowPosition || { x: 100, y: -300 });
        setWindowSize(config.windowSize || { width: 400, height: 600 });
      } else {
        setWindowPosition({ x: 100, y: -300 });
      }
    };

    fetchConfig();

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes.config) {
        const newConfig: Config = JSON.parse(changes.config.newValue as string);
        setShowButton(newConfig.showFloatingButton !== false);
        if (newConfig.windowPosition) {
          setWindowPosition(newConfig.windowPosition);
        }
        if (newConfig.windowSize) {
          setWindowSize(newConfig.windowSize);
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const messageListener = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
      if (message.type === 'OPEN_FLOATING_WINDOW') {
        setWindowVisible(true);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  useEffect(() => {
    setPageTitle(document.title);
  }, []);

  const toggleWindow = () => {
    setWindowVisible(!windowVisible);
  };

  if (!showButton) {
    return null;
  }

  return (
    <>
      <Fab onClick={toggleWindow} />
      <Window
        visible={windowVisible}
        onClose={toggleWindow}
        title={pageTitle}
        position={windowPosition}
        size={windowSize}
        setSize={setWindowSize}
      />
    </>
  );
};

export default App;
