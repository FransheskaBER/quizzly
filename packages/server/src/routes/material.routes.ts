import { Router } from 'express';

import { asyncHandler } from '../utils/asyncHandler.js';
import { auth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as materialService from '../services/material.service.js';
import {
  requestUploadUrlSchema,
  extractUrlSchema,
  materialParamsSchema,
  materialSessionParamsSchema,
} from '@skills-trainer/shared';
import { UnauthorizedError } from '../utils/errors.js';

const router = Router();

// POST /api/sessions/:sessionId/materials/upload-url
// Step 1 of file upload: creates a DB row and returns a presigned S3 PUT URL.
router.post(
  '/:sessionId/materials/upload-url',
  auth,
  validate({ params: materialSessionParamsSchema, body: requestUploadUrlSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const result = await materialService.requestUploadUrl(
      req.body,
      req.params.sessionId as string,
      req.user.userId,
    );
    res.status(201).json(result);
  }),
);

// POST /api/sessions/:sessionId/materials/:id/process
// Step 2 of file upload: triggers text extraction after the client PUT to S3.
router.post(
  '/:sessionId/materials/:id/process',
  auth,
  validate({ params: materialParamsSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const result = await materialService.processMaterial(
      req.params.id as string,
      req.params.sessionId as string,
      req.user.userId,
    );
    res.status(200).json(result);
  }),
);

// POST /api/sessions/:sessionId/materials/extract-url
// Creates a material by fetching and extracting content from a URL.
router.post(
  '/:sessionId/materials/extract-url',
  auth,
  validate({ params: materialSessionParamsSchema, body: extractUrlSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    const result = await materialService.extractUrl(
      req.body,
      req.params.sessionId as string,
      req.user.userId,
    );
    res.status(201).json(result);
  }),
);

// DELETE /api/sessions/:sessionId/materials/:id
router.delete(
  '/:sessionId/materials/:id',
  auth,
  validate({ params: materialParamsSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw new UnauthorizedError('Not authenticated');
    await materialService.deleteMaterial(
      req.params.id as string,
      req.params.sessionId as string,
      req.user.userId,
    );
    res.status(204).send();
  }),
);

export { router as materialRouter };
