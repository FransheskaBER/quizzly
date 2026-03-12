import { api } from '@/store/api';
import type {
  ApiKeyStatusResponse,
  SaveApiKeyRequest,
} from '@skills-trainer/shared';

export const userApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getApiKeyStatus: builder.query<ApiKeyStatusResponse, void>({
      query: () => '/users/api-key/status',
      providesTags: ['ApiKeyStatus'],
    }),

    saveApiKey: builder.mutation<ApiKeyStatusResponse, SaveApiKeyRequest>({
      query: (body) => ({ url: '/users/api-key', method: 'POST', body }),
      invalidatesTags: ['ApiKeyStatus'],
    }),

    deleteApiKey: builder.mutation<void, void>({
      query: () => ({ url: '/users/api-key', method: 'DELETE' }),
      invalidatesTags: ['ApiKeyStatus'],
    }),
  }),
});

export const {
  useGetApiKeyStatusQuery,
  useSaveApiKeyMutation,
  useDeleteApiKeyMutation,
} = userApi;
