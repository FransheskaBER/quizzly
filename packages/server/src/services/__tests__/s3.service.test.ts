import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

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

vi.mock('../../config/s3.js', () => ({
  s3Client: { send: vi.fn() },
  bucketName: 'test-bucket',
}));

vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

import { s3Client } from '../../config/s3.js';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { MAX_FILE_SIZE_BYTES } from '@skills-trainer/shared';
import * as s3Service from '../s3.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// generateUploadUrl
// ---------------------------------------------------------------------------
describe('generateUploadUrl', () => {
  it('returns { uploadUrl, expiresIn: 300 }', async () => {
    (getSignedUrl as Mock).mockResolvedValue('https://s3.example.com/presigned-put');

    const result = await s3Service.generateUploadUrl({
      key: 'sessions/abc/notes.pdf',
      contentType: 'application/pdf',
    });

    expect(result.uploadUrl).toBe('https://s3.example.com/presigned-put');
    expect(result.expiresIn).toBe(300);
  });

  it('builds PutObjectCommand with correct Bucket, Key, and ContentType', async () => {
    (getSignedUrl as Mock).mockResolvedValue('https://s3.example.com/presigned-put');

    await s3Service.generateUploadUrl({
      key: 'sessions/abc/notes.pdf',
      contentType: 'application/pdf',
    });

    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'sessions/abc/notes.pdf',
        ContentType: 'application/pdf',
      }),
    );
    expect(getSignedUrl).toHaveBeenCalledWith(s3Client, expect.anything(), { expiresIn: 300 });
  });

  it('logs with key and bucket then rethrows when getSignedUrl throws', async () => {
    const s3Error = new Error('InvalidAccessKeyId');
    (getSignedUrl as Mock).mockRejectedValue(s3Error);

    await expect(
      s3Service.generateUploadUrl({ key: 'sessions/abc/notes.pdf', contentType: 'application/pdf' }),
    ).rejects.toThrow('InvalidAccessKeyId');

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: s3Error, key: 'sessions/abc/notes.pdf', bucket: 'test-bucket' }),
      'Failed to generate upload URL',
    );
  });
});

// ---------------------------------------------------------------------------
// generateDownloadUrl
// ---------------------------------------------------------------------------
describe('generateDownloadUrl', () => {
  it('returns { downloadUrl, expiresIn: 900 }', async () => {
    (getSignedUrl as Mock).mockResolvedValue('https://s3.example.com/presigned-get');

    const result = await s3Service.generateDownloadUrl({ key: 'sessions/abc/notes.pdf' });

    expect(result.downloadUrl).toBe('https://s3.example.com/presigned-get');
    expect(result.expiresIn).toBe(900);
  });

  it('builds GetObjectCommand with correct Bucket and Key', async () => {
    (getSignedUrl as Mock).mockResolvedValue('https://s3.example.com/presigned-get');

    await s3Service.generateDownloadUrl({ key: 'sessions/abc/notes.pdf' });

    expect(GetObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'sessions/abc/notes.pdf',
      }),
    );
    expect(getSignedUrl).toHaveBeenCalledWith(s3Client, expect.anything(), { expiresIn: 900 });
  });

  it('logs with key and bucket then rethrows when getSignedUrl throws', async () => {
    const s3Error = new Error('NoSuchBucket');
    (getSignedUrl as Mock).mockRejectedValue(s3Error);

    await expect(
      s3Service.generateDownloadUrl({ key: 'sessions/abc/notes.pdf' }),
    ).rejects.toThrow('NoSuchBucket');

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: s3Error, key: 'sessions/abc/notes.pdf', bucket: 'test-bucket' }),
      'Failed to generate download URL',
    );
  });
});

// ---------------------------------------------------------------------------
// getObjectBuffer
// ---------------------------------------------------------------------------
describe('getObjectBuffer', () => {
  it('returns a Buffer of the object body on success', async () => {
    const fakeBytes = new Uint8Array([1, 2, 3, 4]);
    (s3Client.send as Mock).mockResolvedValue({
      Body: { transformToByteArray: vi.fn().mockResolvedValue(fakeBytes) },
    });

    const result = await s3Service.getObjectBuffer('sessions/abc/notes.pdf');

    expect(result).toBeInstanceOf(Buffer);
    expect(Array.from(result)).toEqual([1, 2, 3, 4]);
  });

  it('throws an error if transformToByteArray returns bytes exceeding MAX_FILE_SIZE_BYTES', async () => {
    const oversizedBytes = new Uint8Array(MAX_FILE_SIZE_BYTES + 1);
    (s3Client.send as Mock).mockResolvedValue({
      Body: { transformToByteArray: vi.fn().mockResolvedValue(oversizedBytes) },
    });

    await expect(s3Service.getObjectBuffer('sessions/abc/oversized.pdf')).rejects.toThrow(
      `File size exceeds maximum allowed size of ${MAX_FILE_SIZE_BYTES} bytes`
    );
  });

  it('streams the object body and returns a concatenated Buffer', async () => {
    const chunk1 = Buffer.from('hello ');
    const chunk2 = Buffer.from('world');

    const fakeStream = {
      on: vi.fn().mockImplementation((event: string, handler: (arg?: Buffer) => void) => {
        if (event === 'data') {
          handler(chunk1);
          handler(chunk2);
        }
        if (event === 'end') {
          handler();
        }
        return fakeStream;
      }),
      destroy: vi.fn(),
    };

    (s3Client.send as Mock).mockResolvedValue({
      Body: fakeStream,
    });

    const result = await s3Service.getObjectBuffer('sessions/abc/stream.pdf');

    expect(result).toBeInstanceOf(Buffer);
    expect(result.toString('utf-8')).toBe('hello world');
    expect(fakeStream.on).toHaveBeenCalledWith('data', expect.any(Function));
    expect(fakeStream.on).toHaveBeenCalledWith('end', expect.any(Function));
  });

  it('rejects the promise and destroys the stream if chunks exceed MAX_FILE_SIZE_BYTES', async () => {
    const chunk = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1, 'a');

    const fakeStream = {
      on: vi.fn().mockImplementation((event: string, handler: (arg?: Buffer) => void) => {
        if (event === 'data') {
          handler(chunk);
        }
        return fakeStream;
      }),
      destroy: vi.fn(),
    };

    (s3Client.send as Mock).mockResolvedValue({
      Body: fakeStream,
    });

    await expect(s3Service.getObjectBuffer('sessions/abc/toolarge.pdf')).rejects.toThrow(
      `File size exceeds maximum allowed size of ${MAX_FILE_SIZE_BYTES} bytes`
    );
    expect(fakeStream.destroy).toHaveBeenCalledWith(expect.any(Error));
  });

  it('throws when S3 returns no Body', async () => {
    (s3Client.send as Mock).mockResolvedValue({ Body: undefined });

    await expect(s3Service.getObjectBuffer('sessions/abc/notes.pdf')).rejects.toThrow(
      'No body returned from S3',
    );
  });

  it('rethrows when s3Client.send throws', async () => {
    const s3Error = new Error('AccessDenied');
    (s3Client.send as Mock).mockRejectedValue(s3Error);

    await expect(s3Service.getObjectBuffer('sessions/abc/notes.pdf')).rejects.toThrow('AccessDenied');
  });
});

// ---------------------------------------------------------------------------
// deleteObject
// ---------------------------------------------------------------------------
describe('deleteObject', () => {
  it('calls DeleteObjectCommand with correct Bucket and Key', async () => {
    (s3Client.send as Mock).mockResolvedValue({});

    await s3Service.deleteObject('sessions/abc/notes.pdf');

    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'sessions/abc/notes.pdf',
    });
  });

  it('resolves without throwing on success', async () => {
    (s3Client.send as Mock).mockResolvedValue({});

    await expect(s3Service.deleteObject('sessions/abc/notes.pdf')).resolves.toBeUndefined();
  });

  it('is idempotent — resolves when S3 returns a NoSuchKey error', async () => {
    const noSuchKey = Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
    (s3Client.send as Mock).mockRejectedValue(noSuchKey);

    await expect(s3Service.deleteObject('sessions/abc/missing.pdf')).resolves.toBeUndefined();
  });

  it('rethrows unexpected S3 errors', async () => {
    const networkError = new Error('NetworkingError');
    (s3Client.send as Mock).mockRejectedValue(networkError);

    await expect(s3Service.deleteObject('sessions/abc/notes.pdf')).rejects.toThrow('NetworkingError');
  });
});
