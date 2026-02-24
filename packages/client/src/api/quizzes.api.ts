import { api } from '@/store/api';
import type { QuizAttemptResponse, SaveAnswersRequest, QuizResultsResponse } from '@skills-trainer/shared';

type AnswerInput = SaveAnswersRequest['answers'][number];

// quizzesApi is referenced inside onQueryStarted, which is a closure executed
// at runtime (not during module initialisation), so the self-reference is safe.
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
      // Optimistically write saved answers into the getQuiz cache so that
      // QuizTakingPage can safely clear dirtyAnswers after a successful save
      // without the visual selection reverting to null.
      //
      // Why this is needed: QuizTakingPage keeps unsaved edits in dirtyAnswers
      // and clears them once doSave() resolves. Without this update, clearing
      // dirtyAnswers would cause effectiveAnswers to fall back to the stale
      // quiz.answers cache (still null), making the selected option disappear.
      async onQueryStarted({ id, answers }, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          quizzesApi.util.updateQueryData('getQuiz', id, (draft) => {
            const now = new Date().toISOString();
            for (const { questionId, answer } of answers) {
              const cached = draft.answers.find((a) => a.questionId === questionId);
              if (cached) {
                cached.userAnswer = answer;
                cached.answeredAt = now;
              }
            }
          }),
        );
        // Roll back the optimistic update if the server rejects the save.
        // dirtyAnswers is NOT cleared on failure (see doSave catch block),
        // so the visual state is preserved via dirty even after the rollback.
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
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
