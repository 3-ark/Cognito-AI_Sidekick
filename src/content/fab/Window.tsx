import React, { useRef, SyntheticEvent, useState } from 'react';
import Draggable, { DraggableEvent, DraggableData } from 'react-draggable';
import { Resizable, ResizeCallbackData } from 'react-resizable';
import storage from '../../background/storageUtil';
import { Config } from '../../types/config';

interface WindowProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  position?: { x: number; y: number };
  size: { width: number; height: number };
  setSize: (size: { width: number; height: number }) => void;
}

const Window: React.FC<WindowProps> = ({
  visible,
  onClose,
  title,
  position,
  size,
  setSize,
}) => {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [resizing, setResizing] = useState(false);

  const handleStop = async (e: DraggableEvent, data: DraggableData) => {
    storage.getItem('config').then((storedConfig) => {
      const config: Config = storedConfig ? JSON.parse(storedConfig) : {};
      config.windowPosition = { x: data.x, y: data.y };
      storage.setItem('config', JSON.stringify(config));
    });
  };

  // Hide iframe while resizing to avoid heavy reflows/flicker
  const onResizeStart = (e: SyntheticEvent) => {
    setResizing(true);
    if (iframeRef.current) {
      // keep iframe painted on its own layer but stop pointer events
      iframeRef.current.style.pointerEvents = 'none';
      iframeRef.current.style.opacity = '0.999'; // avoid visibility blanking
      iframeRef.current.style.transition = 'none';
      iframeRef.current.style.willChange = 'transform, opacity';
      iframeRef.current.style.transform = 'translateZ(0)';
    }
  };

  const onResize = (e: SyntheticEvent, data: ResizeCallbackData) => {
    const newSize = { width: data.size.width, height: data.size.height };
    setSize(newSize);
  };

  const onResizeStop = (e: SyntheticEvent, data: ResizeCallbackData) => {
    const newSize = { width: data.size.width, height: data.size.height };
    setSize(newSize);
    storage.getItem('config').then((storedConfig) => {
      const config: Config = storedConfig ? JSON.parse(storedConfig) : {};
      config.windowSize = newSize;
      storage.setItem('config', JSON.stringify(config));
    });

    setResizing(false);

    if (iframeRef.current) {
      // restore interactive state after a short delay to let compositor settle
      setTimeout(() => {
        iframeRef.current!.style.opacity = '';
        iframeRef.current!.style.pointerEvents = 'auto';
        iframeRef.current!.style.transition = '';
        iframeRef.current!.style.willChange = '';
      }, 200); // increased delay
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <Draggable
      nodeRef={nodeRef}
      handle="#cognito-window-header"
      defaultPosition={position}
      onStop={handleStop as any}
      cancel=".react-resizable-handle">
      <Resizable
        height={size.height}
        width={size.width}
        onResizeStart={onResizeStart}
        onResize={onResize}
        onResizeStop={onResizeStop}
        minConstraints={[200, 200]}>
        <div
          ref={nodeRef}
          id="cognito-window"
          className={resizing ? 'resizing' : ''}
          data-testid="cognito-window"
          style={{
            width: size.width,
            height: size.height,
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 2147483647,
          }}>
          <div id="cognito-window-header">
            <span id="cognito-window-title">Chat on: {title}</span>
            <button id="cognito-window-close" onClick={onClose}>
              &times;
            </button>
          </div>

          {/* transparent overlay to capture pointer during resize */}
          {resizing && <div className="cognito-resize-overlay" />}

          <iframe
            ref={iframeRef}
            id="cognito-window-iframe"
            src={chrome.runtime.getURL('assets/sidePanel.html')}
          />
        </div>
      </Resizable>
    </Draggable>
  );
};

export default Window;