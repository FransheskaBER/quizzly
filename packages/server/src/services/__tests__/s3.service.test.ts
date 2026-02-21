import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

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
