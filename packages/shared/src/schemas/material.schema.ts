import { z } from 'zod';
import { uuidSchema } from './common.schema.js';
import { MAX_FILE_SIZE_BYTES } from '../constants/material.constants.js';
import { MaterialStatus } from '../enums/index.js';

// Request schemas

export const requestUploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.enum(['pdf', 'docx', 'txt']),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
});

export const extractUrlSchema = z.object({
  url: z.string().url().max(2000),
});

export const materialParamsSchema = z.object({
  sessionId: uuidSchema,
  id: uuidSchema,
});

export const materialSessionParamsSchema = z.object({
  sessionId: uuidSchema,
});

// Response schemas

export const uploadUrlResponseSchema = z.object({
  materialId: z.string().uuid(),
  uploadUrl: z.string().url(),
  expiresIn: z.number(),
});

export const materialResponseSchema = z.object({
  id: uuidSchema,
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number().nullable(),
  sourceUrl: z.string().nullable(),
  tokenCount: z.number().int(),
  status: z.nativeEnum(MaterialStatus),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
});
