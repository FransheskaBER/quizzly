import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function (this: typeof logger) { return this; }),
    level: 'info',
    silent: vi.fn(),
    trace: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  };
  return { mockLogger: logger };
});

vi.mock('pino', () => ({ default: () => mockLogger }));

vi.mock('../../config/database.js', () => ({
  prisma: {
    session: { findUnique: vi.fn() },
    material: {
      count: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('../s3.service.js', () => ({
  generateUploadUrl: vi.fn(),
  getObjectBuffer: vi.fn(),
  deleteObject: vi.fn(),
}));

// jsdom and readability are used inside fetchAndExtractUrl — mock them minimally
vi.mock('jsdom', () => ({
  JSDOM: vi.fn().mockImplementation(() => ({ window: { document: {} } })),
}));

vi.mock('@mozilla/readability', () => ({
  Readability: vi.fn().mockImplementation(() => ({
    parse: vi.fn().mockReturnValue({ textContent: 'some readable content '.repeat(20) }),
  })),
}));

import { prisma } from '../../config/database.js';
import { extractUrl } from '../material.service.js';
import { BadRequestError } from '../../utils/errors.js';
import { MaterialStatus } from '@skills-trainer/shared';

const USER_ID = 'user-uuid-111';
const SESSION_ID = 'session-uuid-aaa';

const mockSession = {
  id: SESSION_ID,
  userId: USER_ID,
  name: 'Test Session',
  subject: 'Test',
  goal: 'Test goal',
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// extractUrl — network / fetch error paths
// ---------------------------------------------------------------------------
describe('extractUrl — fetch error handling', () => {
  beforeEach(() => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSession);
    vi.mocked(prisma.material.count).mockResolvedValue(0);
    vi.mocked(prisma.material.aggregate).mockResolvedValue({ _sum: { tokenCount: 0 } } as Awaited<ReturnType<typeof prisma.material.aggregate>>);
  });

  it('throws BadRequestError and logs warn when fetch throws TypeError (network failure)', async () => {
    const networkError = Object.assign(new TypeError('Failed to fetch'), { name: 'TypeError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError));

    await expect(
      extractUrl({ url: 'https://example.com/page' }, SESSION_ID, USER_ID),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      extractUrl({ url: 'https://example.com/page' }, SESSION_ID, USER_ID),
    ).rejects.toMatchObject({ message: 'Could not reach this URL. Check that it is publicly accessible.' });

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/page' }),
      'URL fetch failed — network error or timeout',
    );

    vi.unstubAllGlobals();
  });

  it('throws BadRequestError and logs warn when fetch is aborted (timeout)', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    await expect(
      extractUrl({ url: 'https://example.com/page' }, SESSION_ID, USER_ID),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/page' }),
      'URL fetch failed — network error or timeout',
    );

    vi.unstubAllGlobals();
  });

  it('rethrows and logs error for unexpected non-network fetch errors', async () => {
    const unexpectedError = new Error('Unexpected internal error');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(unexpectedError));

    await expect(
      extractUrl({ url: 'https://example.com/page' }, SESSION_ID, USER_ID),
    ).rejects.toThrow('Unexpected internal error');

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/page' }),
      'Unexpected error fetching URL',
    );

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// processMaterial — S3 download error vs text extraction error
// ---------------------------------------------------------------------------
describe('processMaterial — S3 download error', () => {
  it('logs with s3Key context and throws "Failed to download file from storage" when S3 is unreachable', async () => {
    const { processMaterial } = await import('../material.service.js');

    vi.mocked(prisma.session.findUnique).mockResolvedValue(mockSession);
    vi.mocked(prisma.material.findFirst).mockResolvedValue({
      id: 'material-uuid-1',
      sessionId: SESSION_ID,
      fileName: 'notes.pdf',
      fileType: 'pdf',
      fileSize: 1024,
      s3Key: 'sessions/abc/notes.pdf',
      extractedText: '',
      tokenCount: 0,
      status: MaterialStatus.PROCESSING,
      errorMessage: null,
      sourceUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(prisma.material.update).mockResolvedValue({} as Awaited<ReturnType<typeof prisma.material.update>>);

    const { getObjectBuffer } = await import('../s3.service.js');
    vi.mocked(getObjectBuffer).mockRejectedValue(new Error('AccessDenied'));

    await expect(
      processMaterial('material-uuid-1', SESSION_ID, USER_ID),
    ).rejects.toMatchObject({ message: 'Failed to download file from storage' });

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ s3Key: 'sessions/abc/notes.pdf', materialId: 'material-uuid-1' }),
      'Failed to download material from S3',
    );
  });
});
