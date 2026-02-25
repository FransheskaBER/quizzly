import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import pino from 'pino';
import type { Readable } from 'stream';
import { MAX_FILE_SIZE_BYTES } from '@skills-trainer/shared';
import { s3Client, bucketName } from '../config/s3.js';

const logger = pino({ name: 's3-service' });

const UPLOAD_EXPIRES_IN = 300 as const;   // 5 minutes
const DOWNLOAD_EXPIRES_IN = 900 as const; // 15 minutes

export interface UploadUrlResult {
  uploadUrl: string;
  expiresIn: typeof UPLOAD_EXPIRES_IN;
}

export interface DownloadUrlResult {
  downloadUrl: string;
  expiresIn: typeof DOWNLOAD_EXPIRES_IN;
}

export const generateUploadUrl = async (input: {
  key: string;
  contentType: string;
}): Promise<UploadUrlResult> => {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: input.key,
    ContentType: input.contentType,
  });

  try {
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: UPLOAD_EXPIRES_IN });
    return { uploadUrl, expiresIn: UPLOAD_EXPIRES_IN };
  } catch (err) {
    logger.error({ err, key: input.key, bucket: bucketName }, 'Failed to generate upload URL');
    throw err;
  }
};

export const generateDownloadUrl = async (input: {
  key: string;
}): Promise<DownloadUrlResult> => {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: input.key,
  });

  try {
    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: DOWNLOAD_EXPIRES_IN });
    return { downloadUrl, expiresIn: DOWNLOAD_EXPIRES_IN };
  } catch (err) {
    logger.error({ err, key: input.key, bucket: bucketName }, 'Failed to generate download URL');
    throw err;
  }
};

export const getObjectBuffer = async (key: string): Promise<Buffer> => {
  const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error(`No body returned from S3 for key: ${key}`);
  }

  // To prevent OOM from oversized files, stream the body and limit the size.
  // Using MAX_FILE_SIZE_BYTES from shared constants.
  const MAX_SIZE = MAX_FILE_SIZE_BYTES;
  
  // Create a custom stream consumer that enforces the limit
  const chunks: Buffer[] = [];
  let totalLength = 0;
  
  // Node.js readable stream
  if ('on' in response.Body && typeof (response.Body as unknown as Record<string, unknown>).on === 'function') {
    return new Promise((resolve, reject) => {
      const stream = response.Body as Readable;
      
      stream.on('error', reject);
      
      stream.on('data', (chunk: Buffer) => {
        totalLength += chunk.length;
        if (totalLength > MAX_SIZE) {
          const err = new Error(`File size exceeds maximum allowed size of ${MAX_SIZE} bytes`);
          reject(err);
          stream.destroy(err);
          return;
        }
        chunks.push(chunk);
      });
      
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }
  
  // Fallback for non-stream bodies (e.g. if transformToByteArray is the only option)
  const bytes = await response.Body.transformToByteArray();
  if (bytes.length > MAX_SIZE) {
    throw new Error(`File size exceeds maximum allowed size of ${MAX_SIZE} bytes`);
  }
  return Buffer.from(bytes);
};

export const deleteObject = async (key: string): Promise<void> => {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
    logger.info({ key }, 'S3 object deleted');
  } catch (err) {
    const error = err as { name?: string; Code?: string };

    // S3 DeleteObject is natively idempotent — a missing key never throws in practice,
    // but defend against SDK-level NoSuchKey errors just in case.
    if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
      return;
    }

    logger.error({ err, key }, 'Failed to delete S3 object');
    throw err;
  }
};
