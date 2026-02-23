import { api } from '@/store/api';
import type { QuizAttemptResponse, SaveAnswersRequest } from '@skills-trainer/shared';

type AnswerInput = SaveAnswersRequest['answers'][number];

const quizzesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getQuiz: builder.query<QuizAttemptResponse, string>({
      query: (id) => `/quizzes/${id}`,
      providesTags: (result, error, id) => [{ type: 'Quiz', id }],
    }),

    saveAnswers: builder.mutation<{ saved: number }, { id: string; answers: AnswerInput[] }>({
      query: ({ id, answers }) => ({
        url: `/quizzes/${id}/answers`,
        method: 'PATCH',
        body: { answers },
      }),
    }),

    // POST /api/quizzes/:id/submit — response is an SSE stream (Task 026 handles the stream).
    // For now we fire the request and navigate to results; the results page will connect
    // to the grading stream.
    submitQuiz: builder.mutation<void, { id: string; answers: AnswerInput[] }>({
      query: ({ id, answers }) => ({
        url: `/quizzes/${id}/submit`,
        method: 'POST',
        body: { answers },
      }),
    }),
  }),
});

export const { useGetQuizQuery, useSaveAnswersMutation, useSubmitQuizMutation } = quizzesApi;
