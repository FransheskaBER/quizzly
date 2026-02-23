import { api } from '@/store/api';
import type { QuizAttemptResponse, SaveAnswersRequest, QuizResultsResponse } from '@skills-trainer/shared';

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

    // POST /api/quizzes/:id/submit — responds with an SSE stream.
    // QuizTakingPage fires this and navigates away; the server grades independently.
    // fetchBaseQuery gets a PARSING_ERROR (SSE body ≠ JSON) on 2xx — QuizTakingPage
    // detects this and treats it as a successful submission.
    submitQuiz: builder.mutation<void, { id: string; answers: AnswerInput[] }>({
      query: ({ id, answers }) => ({
        url: `/quizzes/${id}/submit`,
        method: 'POST',
        body: { answers },
      }),
    }),

    // GET /api/quizzes/:id/results — only available after status = 'completed'.
    getResults: builder.query<QuizResultsResponse, string>({
      query: (id) => `/quizzes/${id}/results`,
      providesTags: (result, error, id) => [{ type: 'Quiz', id: `${id}-results` }],
    }),
  }),
});

export const {
  useGetQuizQuery,
  useSaveAnswersMutation,
  useSubmitQuizMutation,
  useGetResultsQuery,
} = quizzesApi;
