import { createSlice } from '@reduxjs/toolkit';
import { ThunkType } from 'src/state/State';

export interface ContentState {
    isLoaded: boolean;
}

export const contentDefaultState: ContentState = {
  isLoaded: false,
};

const slice = createSlice({
  name: 'content',
  initialState: contentDefaultState,
  reducers: {
    reset: () => contentDefaultState,
    contentLoaded: state => {
      state.isLoaded = true;
    },
  }
});

/**
 * this is an example of a thunk, you could add api requests from here
 * and dispatch actions to update the state
 */
export const contentLoaded = (): ThunkType => async (dispatch, getState) => {
  const { isLoaded } = getState().content || {};

  if (isLoaded) return;

  await dispatch(slice.actions.contentLoaded());
};

const { actions, reducer } = slice;
const aliases = {};

export {
 actions, aliases, reducer 
};
