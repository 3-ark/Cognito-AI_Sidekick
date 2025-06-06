import {
  combineReducers,
  configureStore,
  createSerializableStateInvariantMiddleware,
  Middleware,
  Slice,
  UnknownAction
} from '@reduxjs/toolkit';
import { logger } from 'redux-logger';
import { thunk } from 'redux-thunk';
import {
 alias, applyMiddleware, Store, createWrapStore
} from 'webext-redux';

import * as contentSlice from 'src/state/slices/content';
import * as sidePanelSlice from 'src/state/slices/sidePanel';
import { State } from 'src/state/State';

type BuildStoreOptions = {
    reducers?: {
        [key in string]: Slice
    };
    channelName?: string;
};

const backgroundAliases = { ...sidePanelSlice.aliases, ...contentSlice.aliases };

const middleware: Middleware[] = [
  alias(backgroundAliases) as Middleware,
  thunk as Middleware,
  createSerializableStateInvariantMiddleware(),
  logger as Middleware
];

const middlewareForProxy: Middleware[] = [
  alias(backgroundAliases) as Middleware,
  thunk as Middleware,
  createSerializableStateInvariantMiddleware(),
  logger as Middleware,
];

const additionalMiddlewareForConfigureStore: Middleware[] = [
  alias(backgroundAliases) as Middleware,
  logger as Middleware,
];

const buildStoreWithDefaults = ({ channelName }: BuildStoreOptions = {}) => {
  const reducer = combineReducers({
    sidePanel: sidePanelSlice.reducer,
    content: contentSlice.reducer
  });

  const store = configureStore({
    devTools: true,
    reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(additionalMiddlewareForConfigureStore),
  });

  if (channelName) {
    const specificWrapStore = createWrapStore({ channelName });
    specificWrapStore(store);
  }

  return store;
};

export default buildStoreWithDefaults;

export const createStoreProxy = (channelName: string) => {
  const store = new Store<State, UnknownAction>({ channelName });

  applyMiddleware(store, ...middlewareForProxy); 

  return store;
};
