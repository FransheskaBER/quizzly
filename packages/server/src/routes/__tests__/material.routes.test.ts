import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi, type Mock } from 'vitest';
import { execSync } from 'node:child_process';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mocks — declared before imports so Vitest's hoisting picks them up
// ---------------------------------------------------------------------------

vi.mock('../../middleware/rateLimiter.middleware.js', () => ({
  createRateLimiter: () => (_req: never, _res: never, next: () => void) => next(),
  createRateLimiterByEmailAndIp: () => [(_req: never, _res: never, next: () => void) => next()],
  globalRateLimiter: (_req: never, _res: never, next: () => void) => next(),
  quizGenerationHourlyLimiter: (_req: never, _res: never, next: () => void) => next(),
  quizGenerationDailyLimiter: (_req: never, _res: never, next: () => void) => next(),
  regradeRateLimiter: (_req: never, _res: never, next: () => void) => next(),
}));

vi.mock('../../services/s3.service.js', () => ({
  generateUploadUrl: vi.fn(),
  getObjectBuffer: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}));
vi.mock('mammoth', () => ({ default: { extractRawText: vi.fn() } }));
// jsdom + @mozilla/readability are pure computation — not mocked; real HTML is supplied via fetch mock.

import { createApp } from '../../app.js';
import { prisma, cleanDatabase, closeDatabase } from '../../__tests__/helpers/db.helper.js';
import { createTestUser, getAuthToken } from '../../__tests__/helpers/auth.helper.js';
import * as s3Service from '../../services/s3.service.js';
import * as pdfjsMock from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';

const app = createApp();

// A text long enough to pass MIN_EXTRACTED_TEXT_LENGTH (50) and produce ~55 tokens
const EXTRACTED_TEXT = 'x'.repeat(200);
const FAKE_UPLOAD_URL = 'https://fake-s3.example.com/presigned-upload';

/** Build a fake pdfjs-dist document that yields `text` across one page. */
const makePdfDoc = (text: string) => ({
  numPages: 1,
  getPage: vi.fn().mockResolvedValue({
    getTextContent: vi.fn().mockResolvedValue({ items: [{ str: text, hasEOL: false }] }),
    cleanup: vi.fn(),
  }),
  destroy: vi.fn().mockResolvedValue(undefined),
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
});

beforeEach(() => {
  // Default S3 mock implementations
  (s3Service.generateUploadUrl as Mock).mockResolvedValue({
    uploadUrl: FAKE_UPLOAD_URL,
    expiresIn: 300,
  });
  (s3Service.getObjectBuffer as Mock).mockResolvedValue(Buffer.from('fake-file-bytes'));
  (s3Service.deleteObject as Mock).mockResolvedValue(undefined);

  // Default extraction mocks
  (pdfjsMock.getDocument as Mock).mockReturnValue({ promise: Promise.resolve(makePdfDoc(EXTRACTED_TEXT)) });
  (mammoth.extractRawText as Mock).mockResolvedValue({ value: EXTRACTED_TEXT });

  // jsdom and Readability run for real against the HTML returned by the mocked fetch.
});

afterEach(async () => {
  await cleanDatabase();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await closeDatabase();
});

// ---------------------------------------------------------------------------
// Shared DB helpers
// ---------------------------------------------------------------------------

const createSession = async (userId: string) =>
  prisma.session.create({
    data: { userId, name: 'Test Session', subject: 'TypeScript', goal: 'Learn TypeScript' },
  });

const createMaterial = async (
  sessionId: string,
  overrides: Partial<{
    fileType: string;
    s3Key: string | null;
    status: string;
    tokenCount: number;
    fileName: string;
  }> = {},
) =>
  prisma.material.create({
    data: {
      sessionId,
      fileName: overrides.fileName ?? 'test.pdf',
      fileType: overrides.fileType ?? 'pdf',
      s3Key: overrides.s3Key !== undefined ? overrides.s3Key : `sessions/${sessionId}/test.pdf`,
      extractedText: '',
      tokenCount: overrides.tokenCount ?? 0,
      status: overrides.status ?? 'processing',
    },
  });

// ---------------------------------------------------------------------------
// POST /api/sessions/:sessionId/materials/upload-url
// ---------------------------------------------------------------------------
describe('POST /api/sessions/:sessionId/materials/upload-url', () => {
  const uploadBody = { fileName: 'notes.pdf', fileType: 'pdf', fileSize: 1024 };

  it('201 — returns materialId, uploadUrl, and expiresIn', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send(uploadBody);

    expect(res.status).toBe(201);
    expect(res.body.materialId).toBeTypeOf('string');
    expect(res.body.uploadUrl).toBe(FAKE_UPLOAD_URL);
    expect(res.body.expiresIn).toBe(300);
  });

  it('DB — material created with processing status and correct sessionId', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send(uploadBody);

    const material = await prisma.material.findUnique({ where: { id: res.body.materialId } });
    expect(material).not.toBeNull();
    expect(material!.sessionId).toBe(session.id);
    expect(material!.status).toBe('processing');
    expect(material!.fileName).toBe('notes.pdf');
  });

  it('400 — rejects when session already has 10 materials', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);

    // Fill up to the limit
    await Promise.all(
      Array.from({ length: 10 }, () => createMaterial(session.id, { status: 'ready' })),
    );

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send(uploadBody);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('400 — invalid fileType', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/upload-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'file.mp3', fileType: 'mp3', fileSize: 512 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('404 — session does not exist', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);

    const res = await request(app)
      .post('/api/sessions/00000000-0000-0000-0000-000000000000/materials/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send(uploadBody);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('403 — session belongs to another user', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' });
    const { user: other } = await createTestUser({ email: 'other@example.com' });
    const session = await createSession(owner.id);
    const tokenOther = getAuthToken(other);

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/upload-url`)
      .set('Authorization', `Bearer ${tokenOther}`)
      .send(uploadBody);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('401 — no Authorization header', async () => {
    const res = await request(app)
      .post('/api/sessions/00000000-0000-0000-0000-000000000000/materials/upload-url')
      .send(uploadBody);

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/sessions/:sessionId/materials/:id/process
// ---------------------------------------------------------------------------
describe('POST /api/sessions/:sessionId/materials/:id/process', () => {
  it('200 — returns material with ready status after PDF extraction', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);
    const material = await createMaterial(session.id, { fileType: 'pdf' });

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/${material.id}/process`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(material.id);
    expect(res.body.status).toBe('ready');
    expect(res.body.tokenCount).toBeGreaterThan(0);
  });

  it('DB — updates material to ready with extracted text and token count', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);
    const material = await createMaterial(session.id, { fileType: 'pdf' });

    await request(app)
      .post(`/api/sessions/${session.id}/materials/${material.id}/process`)
      .set('Authorization', `Bearer ${token}`);

    const updated = await prisma.material.findUnique({ where: { id: material.id } });
    expect(updated!.status).toBe('ready');
    expect(updated!.extractedText).toBe(EXTRACTED_TEXT);
    expect(updated!.tokenCount).toBeGreaterThan(0);
  });

  it('200 — also works for DOCX files', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);
    const material = await createMaterial(session.id, { fileType: 'docx' });

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/${material.id}/process`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(mammoth.extractRawText).toHaveBeenCalledOnce();
  });

  it('400 — marks as failed when extracted text is too short', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);
    const material = await createMaterial(session.id);

    // Return text shorter than MIN_EXTRACTED_TEXT_LENGTH (50)
    (pdfjsMock.getDocument as Mock).mockReturnValueOnce({ promise: Promise.resolve(makePdfDoc('Too short')) });

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/${material.id}/process`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);

    const updated = await prisma.material.findUnique({ where: { id: material.id } });
    expect(updated!.status).toBe('failed');
  });

  it('400 — marks as failed when processing would exceed token budget', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);

    // Existing ready material consumes nearly the entire budget
    await createMaterial(session.id, { status: 'ready', tokenCount: 149_000 });
    const material = await createMaterial(session.id);

    // This text has 4000 chars → ~1100 tokens → total > 150 000
    (pdfjsMock.getDocument as Mock).mockReturnValueOnce({ promise: Promise.resolve(makePdfDoc('x'.repeat(4_000))) });

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/${material.id}/process`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);

    const updated = await prisma.material.findUnique({ where: { id: material.id } });
    expect(updated!.status).toBe('failed');
  });

  it('404 — material does not exist', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/00000000-0000-0000-0000-000000000000/process`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('403 — session belongs to another user', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' });
    const { user: other } = await createTestUser({ email: 'other@example.com' });
    const session = await createSession(owner.id);
    const material = await createMaterial(session.id);
    const tokenOther = getAuthToken(other);

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/${material.id}/process`)
      .set('Authorization', `Bearer ${tokenOther}`);

    expect(res.status).toBe(403);
  });

  it('401 — no Authorization header', async () => {
    const res = await request(app).post(
      '/api/sessions/00000000-0000-0000-0000-000000000000/materials/00000000-0000-0000-0000-000000000001/process',
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/sessions/:sessionId/materials/extract-url
// ---------------------------------------------------------------------------
describe('POST /api/sessions/:sessionId/materials/extract-url', () => {
  // Rich enough for Readability to successfully extract article text
  const ARTICLE_HTML = `<!DOCTYPE html>
<html><head><title>Test Article</title></head>
<body><article>
<h1>TypeScript Tips</h1>
<p>TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale. It adds optional static typing and class-based object-oriented programming to the language.</p>
<p>With TypeScript you can catch errors early in your editor. This article covers the essential patterns every developer should know when working with TypeScript in a modern Node.js or React project.</p>
<p>Understanding generics, utility types, and strict mode will dramatically improve the quality and maintainability of your code over time.</p>
</article></body></html>`;

  const mockFetch = () => {
    const encoder = new TextEncoder();
    const data = encoder.encode(ARTICLE_HTML);
    let consumed = false;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (h: string) => (h === 'content-type' ? 'text/html; charset=utf-8' : null),
      },
      body: {
        getReader: () => ({
          read: async () => {
            if (consumed) return { done: true, value: undefined };
            consumed = true;
            return { done: false, value: data };
          },
          cancel: async () => {},
        }),
      },
    }));
  };

  it('201 — creates a material from a URL', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);
    mockFetch();

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/extract-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://example.com/article' });

    expect(res.status).toBe(201);
    expect(res.body.fileType).toBe('url');
    expect(res.body.status).toBe('ready');
    expect(res.body.sourceUrl).toBe('https://example.com/article');
    expect(res.body.tokenCount).toBeGreaterThan(0);
  });

  it('DB — material persisted with correct fields', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);
    mockFetch();

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/extract-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://example.com/article' });

    const material = await prisma.material.findUnique({ where: { id: res.body.id } });
    expect(material).not.toBeNull();
    expect(material!.fileType).toBe('url');
    expect(material!.status).toBe('ready');
    expect(material!.sourceUrl).toBe('https://example.com/article');
  });

  it('400 — rejects when session is at 10 material limit', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);
    mockFetch();

    await Promise.all(
      Array.from({ length: 10 }, () => createMaterial(session.id, { status: 'ready' })),
    );

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/extract-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://example.com/article' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('400 — invalid URL body', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/extract-url`)
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'not-a-valid-url' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('403 — session belongs to another user', async () => {
    const { user: owner } = await createTestUser({ email: 'owner2@example.com' });
    const { user: other } = await createTestUser({ email: 'other2@example.com' });
    const session = await createSession(owner.id);
    const tokenOther = getAuthToken(other);

    const res = await request(app)
      .post(`/api/sessions/${session.id}/materials/extract-url`)
      .set('Authorization', `Bearer ${tokenOther}`)
      .send({ url: 'https://example.com/article' });

    expect(res.status).toBe(403);
  });

  it('401 — no Authorization header', async () => {
    const res = await request(app)
      .post('/api/sessions/00000000-0000-0000-0000-000000000000/materials/extract-url')
      .send({ url: 'https://example.com/article' });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/sessions/:sessionId/materials/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/sessions/:sessionId/materials/:id', () => {
  it('204 — deletes the material', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);
    const material = await createMaterial(session.id, { status: 'ready' });

    const res = await request(app)
      .delete(`/api/sessions/${session.id}/materials/${material.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  it('DB — material is removed from database', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);
    const material = await createMaterial(session.id);

    await request(app)
      .delete(`/api/sessions/${session.id}/materials/${material.id}`)
      .set('Authorization', `Bearer ${token}`);

    const deleted = await prisma.material.findUnique({ where: { id: material.id } });
    expect(deleted).toBeNull();
  });

  it('calls deleteObject on S3 when material has an s3Key', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);
    const s3Key = `sessions/${session.id}/file.pdf`;
    const material = await createMaterial(session.id, { s3Key });

    await request(app)
      .delete(`/api/sessions/${session.id}/materials/${material.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(s3Service.deleteObject).toHaveBeenCalledWith(s3Key);
  });

  it('does not call deleteObject when material has no s3Key (URL material)', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);
    const material = await createMaterial(session.id, { s3Key: null, fileType: 'url' });

    await request(app)
      .delete(`/api/sessions/${session.id}/materials/${material.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(s3Service.deleteObject).not.toHaveBeenCalled();
  });

  it('404 — material does not exist', async () => {
    const { user } = await createTestUser();
    const token = getAuthToken(user);
    const session = await createSession(user.id);

    const res = await request(app)
      .delete(`/api/sessions/${session.id}/materials/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('403 — session belongs to another user', async () => {
    const { user: owner } = await createTestUser({ email: 'owner3@example.com' });
    const { user: other } = await createTestUser({ email: 'other3@example.com' });
    const session = await createSession(owner.id);
    const material = await createMaterial(session.id);
    const tokenOther = getAuthToken(other);

    const res = await request(app)
      .delete(`/api/sessions/${session.id}/materials/${material.id}`)
      .set('Authorization', `Bearer ${tokenOther}`);

    expect(res.status).toBe(403);
  });

  it('401 — no Authorization header', async () => {
    const res = await request(app).delete(
      '/api/sessions/00000000-0000-0000-0000-000000000000/materials/00000000-0000-0000-0000-000000000001',
    );

    expect(res.status).toBe(401);
  });
});

