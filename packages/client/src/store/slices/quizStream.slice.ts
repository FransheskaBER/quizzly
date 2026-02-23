import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from '../store';
import type { Question } from '@skills-trainer/shared';

type GenerationStatus = 'idle' | 'connecting' | 'generating' | 'complete' | 'error';
type GradingStatus = 'idle' | 'connecting' | 'grading' | 'complete' | 'error';

export interface GradedQuestion {
  questionId: string;
  score: number;
  isCorrect: boolean;
}

interface QuizStreamState {
  // Generation state
  status: GenerationStatus;
  questions: Question[];
  quizAttemptId: string | null;
  error: string | null;
  totalExpected: number;
  // Grading state
  gradingStatus: GradingStatus;
  gradedQuestions: GradedQuestion[];
  gradingError: string | null;
  gradingFinalScore: number | null;
}

const initialState: QuizStreamState = {
  status: 'idle',
  questions: [],
  quizAttemptId: null,
  error: null,
  totalExpected: 0,
  gradingStatus: 'idle',
  gradedQuestions: [],
  gradingError: null,
  gradingFinalScore: null,
};

const quizStreamSlice = createSlice({
  name: 'quizStream',
  initialState,
  reducers: {
    // Generation actions
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
    generationReset: (state) => {
      state.status = initialState.status;
      state.questions = initialState.questions;
      state.quizAttemptId = initialState.quizAttemptId;
      state.error = initialState.error;
      state.totalExpected = initialState.totalExpected;
    },
    // Grading actions
    gradingStarted: (state) => {
      state.gradingStatus = 'connecting';
      state.gradedQuestions = [];
      state.gradingError = null;
      state.gradingFinalScore = null;
    },
    questionGraded: (state, action: PayloadAction<GradedQuestion>) => {
      state.gradingStatus = 'grading';
      state.gradedQuestions.push(action.payload);
    },
    gradingCompleted: (state, action: PayloadAction<number>) => {
      state.gradingStatus = 'complete';
      state.gradingFinalScore = action.payload;
    },
    gradingFailed: (state, action: PayloadAction<string>) => {
      state.gradingStatus = 'error';
      state.gradingError = action.payload;
    },
    gradingReset: (state) => {
      state.gradingStatus = initialState.gradingStatus;
      state.gradedQuestions = initialState.gradedQuestions;
      state.gradingError = initialState.gradingError;
      state.gradingFinalScore = initialState.gradingFinalScore;
    },
  },
});

export const {
  generationStarted,
  questionsBatchReceived,
  generationCompleted,
  generationFailed,
  generationReset,
  gradingStarted,
  questionGraded,
  gradingCompleted,
  gradingFailed,
  gradingReset,
} = quizStreamSlice.actions;

export const selectQuizStream = (state: RootState) => state.quizStream;
export const selectGradingStream = (state: RootState) => ({
  gradingStatus: state.quizStream.gradingStatus,
  gradedQuestions: state.quizStream.gradedQuestions,
  gradingError: state.quizStream.gradingError,
  gradingFinalScore: state.quizStream.gradingFinalScore,
});

export default quizStreamSlice.reducer;
