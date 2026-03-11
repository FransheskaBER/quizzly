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
    }),

    saveApiKey: builder.mutation<ApiKeyStatusResponse, SaveApiKeyRequest>({
      query: (body) => ({ url: '/users/api-key', method: 'POST', body }),
    }),

    deleteApiKey: builder.mutation<void, void>({
      query: () => ({ url: '/users/api-key', method: 'DELETE' }),
    }),

    updateProfile: builder.mutation<UserResponse, UpdateProfileRequest>({
      query: (body) => ({ url: '/users/profile', method: 'PATCH', body }),
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
