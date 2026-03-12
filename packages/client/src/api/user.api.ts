import { api } from '@/store/api';
import type {
  ApiKeyStatusResponse,
  SaveApiKeyRequest,
  UpdateProfileRequest,
  ChangePasswordRequest,
  UserResponse,
  MessageResponse,
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

    updateProfile: builder.mutation<UserResponse, UpdateProfileRequest>({
      query: (body) => ({ url: '/users/profile', method: 'PATCH', body }),
      invalidatesTags: ['Dashboard'],
    }),

    changePassword: builder.mutation<MessageResponse, ChangePasswordRequest>({
      query: (body) => ({ url: '/users/password', method: 'PUT', body }),
    }),
  }),
});

export const {
  useGetApiKeyStatusQuery,
  useSaveApiKeyMutation,
  useDeleteApiKeyMutation,
  useUpdateProfileMutation,
  useChangePasswordMutation,
} = userApi;
