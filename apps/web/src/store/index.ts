import { configureStore } from '@reduxjs/toolkit';
import authReducer from './modules/auth';
import editorReducer from './modules/editor';
import walletReducer from './modules/wallet';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    editor: editorReducer,
    wallet: walletReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
