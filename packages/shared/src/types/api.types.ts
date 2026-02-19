import type { z } from 'zod';
import type { apiErrorSchema } from '../schemas/common.schema.js';

export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
}

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}
