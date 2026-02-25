import { api } from '@/store/api';
import type { UploadUrlResponse, MaterialResponse } from '@skills-trainer/shared';

const materialsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Step 1 of file upload: get a presigned S3 PUT URL + create a DB record.
    // Intentionally does NOT invalidate any cache — cache refresh happens after processMaterial.
    getUploadUrl: builder.mutation<
      UploadUrlResponse,
      { sessionId: string; fileName: string; fileType: string; fileSize: number }
    >({
      query: ({ sessionId, fileName, fileType, fileSize }) => ({
        url: `/sessions/${sessionId}/materials/upload-url`,
        method: 'POST',
        body: { fileName, fileType, fileSize },
      }),
    }),

    // Step 2 of file upload: trigger text extraction after the browser PUT to S3.
    processMaterial: builder.mutation<
      MaterialResponse,
      { sessionId: string; materialId: string }
    >({
      query: ({ sessionId, materialId }) => ({
        url: `/sessions/${sessionId}/materials/${materialId}/process`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, { sessionId }) => [
        { type: 'Session', id: sessionId },
        { type: 'Session', id: 'LIST' },
      ],
    }),

    // Single-step URL extraction: the backend fetches and processes the URL.
    extractUrl: builder.mutation<MaterialResponse, { sessionId: string; url: string }>({
      query: ({ sessionId, url }) => ({
        url: `/sessions/${sessionId}/materials/extract-url`,
        method: 'POST',
        body: { url },
      }),
      invalidatesTags: (result, error, { sessionId }) => [
        { type: 'Session', id: sessionId },
        { type: 'Session', id: 'LIST' },
      ],
    }),

    // Delete a material — also invalidates Dashboard so session material counts stay fresh.
    deleteMaterial: builder.mutation<void, { sessionId: string; materialId: string }>({
      query: ({ sessionId, materialId }) => ({
        url: `/sessions/${sessionId}/materials/${materialId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { sessionId }) => [
        { type: 'Session', id: sessionId },
        { type: 'Session', id: 'LIST' },
        { type: 'Dashboard' },
      ],
    }),
  }),
});

export const {
  useGetUploadUrlMutation,
  useProcessMaterialMutation,
  useExtractUrlMutation,
  useDeleteMaterialMutation,
} = materialsApi;
