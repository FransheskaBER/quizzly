import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';

interface User {
  id: string;
  email: string;
  username: string;
}

interface AuthState {
  user: User | null;
}

const initialState: AuthState = {
  user: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action: PayloadAction<{ user: User }>) => {
      state.user = action.payload.user;
    },
    logout: (state) => {
      state.user = null;
    },
  },
});

export const { setCredentials, logout } = authSlice.actions;

export const selectCurrentUser = (state: RootState) => state.auth.user;
export const selectIsAuthenticated = (state: RootState) => state.auth.user !== null;

export default authSlice.reducer;
