import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from '../store';
import type { Question } from '@skills-trainer/shared';

type GenerationStatus = 'idle' | 'connecting' | 'generating' | 'complete' | 'error';

interface QuizStreamState {
  status: GenerationStatus;
  questions: Question[];
  quizAttemptId: string | null;
  error: string | null;
  totalExpected: number;
}

const initialState: QuizStreamState = {
  status: 'idle',
  questions: [],
  quizAttemptId: null,
  error: null,
  totalExpected: 0,
};

const quizStreamSlice = createSlice({
  name: 'quizStream',
  initialState,
  reducers: {
    generationStarted: (state, action: PayloadAction<number>) => {
      state.status = 'connecting';
      state.questions = [];
      state.quizAttemptId = null;
      state.error = null;
      state.totalExpected = action.payload;
    },
    questionsBatchReceived: (state, action: PayloadAction<Question[]>) => {
      if (action.payload.length > 0) {
        state.status = 'generating';
        state.questions.push(...action.payload);
      }
    },
    generationCompleted: (state, action: PayloadAction<string>) => {
      state.status = 'complete';
      state.quizAttemptId = action.payload;
    },
    generationFailed: (state, action: PayloadAction<string>) => {
      state.status = 'error';
      state.error = action.payload;
    },
    generationReset: () => initialState,
  },
});

export const {
  generationStarted,
  questionsBatchReceived,
  generationCompleted,
  generationFailed,
  generationReset,
} = quizStreamSlice.actions;

export const selectQuizStream = (state: RootState) => state.quizStream;

export default quizStreamSlice.reducer;
