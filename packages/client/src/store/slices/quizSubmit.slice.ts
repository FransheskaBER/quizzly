import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from '../store';

export interface QuizSubmitFailure {
  quizAttemptId: string;
  sessionId: string;
  message: string;
  createdAt: string;
}

interface QuizSubmitState {
  failuresByQuizAttemptId: Record<string, QuizSubmitFailure>;
}

const initialState: QuizSubmitState = {
  failuresByQuizAttemptId: {},
};

const quizSubmitSlice = createSlice({
  name: 'quizSubmit',
  initialState,
  reducers: {
    submitFailureReported: (state, action: PayloadAction<QuizSubmitFailure>) => {
      state.failuresByQuizAttemptId[action.payload.quizAttemptId] = action.payload;
    },
    submitFailureCleared: (state, action: PayloadAction<string>) => {
      delete state.failuresByQuizAttemptId[action.payload];
    },
  },
});

export const { submitFailureReported, submitFailureCleared } = quizSubmitSlice.actions;

export const selectSubmitFailuresForSession = (
  state: RootState,
  sessionId: string,
): QuizSubmitFailure[] =>
  Object.values(state.quizSubmit.failuresByQuizAttemptId).filter(
    (failure) => failure.sessionId === sessionId,
  );

export default quizSubmitSlice.reducer;
