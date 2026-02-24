import { randomUUID } from 'crypto';
import { createRequire } from 'module';
import path from 'path';
import mammoth from 'mammoth';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import pino from 'pino';

import { prisma } from '../config/database.js';
import { assertOwnership } from '../utils/ownership.js';
import { sanitizeString } from '../utils/sanitize.utils.js';
import { estimateTokenCount } from '../utils/tokenCount.utils.js';
import { generateUploadUrl, getObjectBuffer, deleteObject } from './s3.service.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import {
  MaterialStatus,
  MAX_FILES_PER_SESSION,
  MAX_SESSION_TOKEN_BUDGET,
  MIN_EXTRACTED_TEXT_LENGTH,
  URL_FETCH_TIMEOUT_MS,
  URL_FETCH_MAX_BYTES,
  PRESIGNED_URL_UPLOAD_EXPIRY_SECONDS,
} from '@skills-trainer/shared';
import type {
  RequestUploadUrlRequest,
  ExtractUrlRequest,
  UploadUrlResponse,
  MaterialResponse,
} from '@skills-trainer/shared';

const logger = pino({ name: 'material-service' });

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const verifySessionOwnership = async (sessionId: string, userId: string): Promise<void> => {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError('Session not found');
  assertOwnership(session.userId, userId);
};

const countNonFailedMaterials = async (sessionId: string): Promise<number> => {
  return prisma.material.count({
    where: { sessionId, status: { not: MaterialStatus.FAILED } },
  });
};

const countReadyTokens = async (sessionId: string): Promise<number> => {
  const result = await prisma.material.aggregate({
    where: { sessionId, status: MaterialStatus.READY },
    _sum: { tokenCount: true },
  });
  return result._sum.tokenCount ?? 0;
};

const toMaterialResponse = (m: {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number | null;
  sourceUrl: string | null;
  tokenCount: number;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
}): MaterialResponse => ({
  id: m.id,
  fileName: m.fileName,
  fileType: m.fileType,
  fileSize: m.fileSize,
  sourceUrl: m.sourceUrl,
  tokenCount: m.tokenCount,
  status: m.status as MaterialStatus,
  errorMessage: m.errorMessage,
  createdAt: m.createdAt.toISOString(),
});

// ---------------------------------------------------------------------------
// PDF extraction setup (pdfjs-dist legacy build — handles Google Docs CMaps)
// ---------------------------------------------------------------------------

// Resolve pdfjs-dist install path so we can point it to the CMap files it
// needs for fonts that Google Docs PDFs use. createRequire lets us use
// require.resolve in an ESM module.
const _require = createRequire(import.meta.url);
const pdfJsDistDir = path.dirname(_require.resolve('pdfjs-dist/package.json'));
const CMAP_URL = `${pdfJsDistDir}/cmaps/`;
const STANDARD_FONT_URL = `${pdfJsDistDir}/standard_fonts/`;

// ---------------------------------------------------------------------------
// Text extractors
// ---------------------------------------------------------------------------

const extractPdfText = async (buffer: Buffer): Promise<string> => {
  // Dynamic import of the legacy build — it includes DOM polyfills that the
  // regular build expects from a browser environment.
  // In v5, pdfjs-dist detects Node.js automatically: it sets #isWorkerDisabled=true
  // and defaults workerSrc to "./pdf.worker.mjs" (relative to the package).
  // Do NOT override workerSrc — setting it to '' breaks the fake-worker setup.
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const pdf = await pdfjsLib
    .getDocument({
      data: new Uint8Array(buffer),
      cMapUrl: CMAP_URL,      // path to *.bcmap files (packed binary CMaps)
      cMapPacked: true,
      standardFontDataUrl: STANDARD_FONT_URL,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: false,
    })
    .promise;

  const pages: string[] = [];

  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      try {
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .filter(item => 'str' in item)
          .map(item => {
            const t = item as { str: string; hasEOL: boolean };
            return t.str + (t.hasEOL ? '\n' : '');
          })
          .join('');
        pages.push(pageText);
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await pdf.destroy();
  }

  return pages.join('\n\n');
};

const extractDocxText = async (buffer: Buffer): Promise<string> => {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
};

const extractTxtText = (buffer: Buffer): string => buffer.toString('utf-8');

const fetchAndExtractUrl = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      throw new BadRequestError('URL must point to an HTML page');
    }

    // Read body with a byte cap to prevent DoS via huge pages
    const reader = response.body?.getReader();
    if (!reader) throw new BadRequestError('Failed to read URL response body');

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    let isDone = false;

    while (!isDone) {
      const { done, value } = await reader.read();
      isDone = done;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > URL_FETCH_MAX_BYTES) {
          reader.cancel();
          throw new BadRequestError('URL content exceeds the 5 MB limit');
        }
        chunks.push(value);
      }
    }

    const html = Buffer.concat(chunks).toString('utf-8');
    const dom = new JSDOM(html, { url });
    const reader2 = new Readability(dom.window.document);
    const article = reader2.parse();

    if (!article?.textContent) {
      throw new BadRequestError('Could not extract readable content from the URL');
    }

    return article.textContent;
  } finally {
    clearTimeout(timer);
  }
};

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

export const requestUploadUrl = async (
  data: RequestUploadUrlRequest,
  sessionId: string,
  userId: string,
): Promise<UploadUrlResponse> => {
  await verifySessionOwnership(sessionId, userId);

  const count = await countNonFailedMaterials(sessionId);
  if (count >= MAX_FILES_PER_SESSION) {
    throw new BadRequestError(`Sessions are limited to ${MAX_FILES_PER_SESSION} materials`);
  }

  const s3Key = `sessions/${sessionId}/${randomUUID()}.${data.fileType}`;

  const material = await prisma.material.create({
    data: {
      sessionId,
      fileName: data.fileName,
      fileType: data.fileType,
      fileSize: data.fileSize,
      s3Key,
      extractedText: '',
      tokenCount: 0,
      status: MaterialStatus.PROCESSING,
    },
  });

  const { uploadUrl } = await generateUploadUrl({
    key: s3Key,
    contentType: `application/${data.fileType === 'pdf' ? 'pdf' : data.fileType === 'docx' ? 'vnd.openxmlformats-officedocument.wordprocessingml.document' : 'octet-stream'}`,
  });

  logger.info({ materialId: material.id, sessionId }, 'Upload URL generated');

  return {
    materialId: material.id,
    uploadUrl,
    expiresIn: PRESIGNED_URL_UPLOAD_EXPIRY_SECONDS,
  };
};

export const processMaterial = async (
  materialId: string,
  sessionId: string,
  userId: string,
): Promise<MaterialResponse> => {
  await verifySessionOwnership(sessionId, userId);

  const material = await prisma.material.findFirst({
    where: { id: materialId, sessionId },
  });

  if (!material) throw new NotFoundError('Material not found');
  if (!material.s3Key) throw new BadRequestError('Material has no associated S3 file');

  let extractedText: string;

  try {
    const buffer = await getObjectBuffer(material.s3Key);

    if (material.fileType === 'pdf') {
      extractedText = await extractPdfText(buffer);
    } else if (material.fileType === 'docx') {
      extractedText = await extractDocxText(buffer);
    } else {
      extractedText = extractTxtText(buffer);
    }
  } catch (err) {
    const message = err instanceof BadRequestError ? err.message : 'Failed to extract text from file';
    await prisma.material.update({
      where: { id: materialId },
      data: { status: MaterialStatus.FAILED, errorMessage: message },
    });
    logger.warn({ materialId, err }, 'Text extraction failed');
    throw new BadRequestError(message);
  }

  const sanitized = sanitizeString(extractedText).trim();

  if (sanitized.length < MIN_EXTRACTED_TEXT_LENGTH) {
    const message = 'The file contains too little readable text';
    await prisma.material.update({
      where: { id: materialId },
      data: { status: MaterialStatus.FAILED, errorMessage: message },
    });
    throw new BadRequestError(message);
  }

  const tokenCount = estimateTokenCount(sanitized);
  const existingTokens = await countReadyTokens(sessionId);

  if (existingTokens + tokenCount > MAX_SESSION_TOKEN_BUDGET) {
    const message = 'Adding this material would exceed the session token budget';
    await prisma.material.update({
      where: { id: materialId },
      data: { status: MaterialStatus.FAILED, errorMessage: message },
    });
    throw new BadRequestError(message);
  }

  const updated = await prisma.material.update({
    where: { id: materialId },
    data: { extractedText: sanitized, tokenCount, status: MaterialStatus.READY },
  });

  logger.info({ materialId, tokenCount }, 'Material processed successfully');

  return toMaterialResponse(updated);
};

export const extractUrl = async (
  data: ExtractUrlRequest,
  sessionId: string,
  userId: string,
): Promise<MaterialResponse> => {
  await verifySessionOwnership(sessionId, userId);

  const count = await countNonFailedMaterials(sessionId);
  if (count >= MAX_FILES_PER_SESSION) {
    throw new BadRequestError(`Sessions are limited to ${MAX_FILES_PER_SESSION} materials`);
  }

  const rawText = await fetchAndExtractUrl(data.url);
  const sanitized = sanitizeString(rawText).trim();

  if (sanitized.length < MIN_EXTRACTED_TEXT_LENGTH) {
    throw new BadRequestError('Could not extract enough readable content from the URL');
  }

  const tokenCount = estimateTokenCount(sanitized);
  const existingTokens = await countReadyTokens(sessionId);

  if (existingTokens + tokenCount > MAX_SESSION_TOKEN_BUDGET) {
    throw new BadRequestError('Adding this URL would exceed the session token budget');
  }

  const urlObj = new URL(data.url);
  const fileName = (urlObj.hostname + urlObj.pathname).slice(0, 255);

  const material = await prisma.material.create({
    data: {
      sessionId,
      fileName,
      fileType: 'url',
      sourceUrl: data.url,
      extractedText: sanitized,
      tokenCount,
      status: MaterialStatus.READY,
    },
  });

  logger.info({ materialId: material.id, tokenCount }, 'URL material created');

  return toMaterialResponse(material);
};

export const deleteMaterial = async (
  materialId: string,
  sessionId: string,
  userId: string,
): Promise<void> => {
  await verifySessionOwnership(sessionId, userId);

  const material = await prisma.material.findFirst({
    where: { id: materialId, sessionId },
  });

  if (!material) throw new NotFoundError('Material not found');

  if (material.s3Key) {
    await deleteObject(material.s3Key);
  }

  await prisma.material.delete({ where: { id: materialId } });

  logger.info({ materialId }, 'Material deleted');
};

