import { contentLoaded } from 'src/state/slices/content';
import { createStoreProxy } from 'src/state/store';
import ChannelNames from '../types/ChannelNames';

(async () => {
  try {
    if (
      window.location.protocol === 'chrome:' ||
      window.location.protocol === 'chrome-extension:'
    ) {
      return;
    }

    const store = createStoreProxy(ChannelNames.ContentPort);

    try {
      await store.ready();
      store.dispatch(contentLoaded());
    } catch (initError) {
    }
  } catch (err) {
  }
})();

export {};