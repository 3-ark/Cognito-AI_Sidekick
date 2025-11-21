import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { Toaster, toast } from 'react-hot-toast';
import { Provider } from 'react-redux';

import { createStoreProxy } from 'src/state/store';
import ChannelNames from 'src/types/ChannelNames';
import i18n from '../i18n';

import { ConfigProvider } from './ConfigContext';
import Cognito from './Cognito';

import 'src/content/index.css';

const store = createStoreProxy(ChannelNames.ContentPort);
const container = document.getElementById('root');

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SHOW_ERROR_TOAST') {
    toast.error(message.payload);
  }
  if (message.type === 'SHOW_SUCCESS_TOAST') {
    toast.success(message.payload);
  }
});

store.ready().then(() => {
  if (container == null) {
    throw new Error('Root container not found');
  }

  const root = createRoot(container);

  root.render(
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <ConfigProvider>
          <Cognito />
          <Toaster />
        </ConfigProvider>
      </I18nextProvider>
    </Provider>,
  );
});
