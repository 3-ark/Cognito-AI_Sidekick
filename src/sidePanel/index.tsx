import './i18n';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import { createStoreProxy } from 'src/state/store';
import ChannelNames from 'src/types/ChannelNames';

import Cognito from './Cognito';
import { ConfigProvider } from './ConfigContext';

import 'src/content/index.css';
import { cn } from '@/src/background/util';

const store = createStoreProxy(ChannelNames.ContentPort);
const container = document.getElementById('root');

store.ready().then(() => {
  if (container == null) {
    throw new Error('Root container not found');
  }

  const root = createRoot(container);

  root.render(
    <Provider store={store}>
      <ConfigProvider>
        <Cognito />
      </ConfigProvider>
    </Provider>
  );
});