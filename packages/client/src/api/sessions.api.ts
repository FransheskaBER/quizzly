import { api } from '@/store/api';
import type {
  SessionListResponse,
  SessionDetailResponse,
  SessionResponse,
  CreateSessionRequest,
  UpdateSessionRequest,
} from '@skills-trainer/shared';

const sessionsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getSessions: builder.query<SessionListResponse, { cursor?: string; limit?: number }>({
      query: ({ cursor, limit = 20 }) => {
        const params: Record<string, string | number> = { limit };
        if (cursor) params.cursor = cursor;
        return { url: '/sessions', params };
      },
      providesTags: [{ type: 'Session', id: 'LIST' }],
    }),

    getSession: builder.query<SessionDetailResponse, string>({
      query: (id) => `/sessions/${id}`,
      providesTags: (result, error, id) => [{ type: 'Session', id }],
    }),

    createSession: builder.mutation<SessionResponse, CreateSessionRequest>({
      query: (body) => ({ url: '/sessions', method: 'POST', body }),
      invalidatesTags: [{ type: 'Session', id: 'LIST' }, { type: 'Dashboard' }],
    }),

    updateSession: builder.mutation<SessionResponse, { id: string; data: UpdateSessionRequest }>({
      query: ({ id, data }) => ({ url: `/sessions/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'Session', id: 'LIST' },
        { type: 'Session', id },
      ],
    }),

    deleteSession: builder.mutation<void, string>({
      query: (id) => ({ url: `/sessions/${id}`, method: 'DELETE' }),
      invalidatesTags: (result, error, id) => [
        { type: 'Session', id: 'LIST' },
        { type: 'Session', id },
        { type: 'Dashboard' },
      ],
    }),
  }),
});

export const {
  useGetSessionsQuery,
  useGetSessionQuery,
  useCreateSessionMutation,
  useUpdateSessionMutation,
  useDeleteSessionMutation,
} = sessionsApi;
