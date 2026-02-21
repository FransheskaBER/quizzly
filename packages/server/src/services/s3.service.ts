import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import pino from 'pino';
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

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: UPLOAD_EXPIRES_IN });

  return { uploadUrl, expiresIn: UPLOAD_EXPIRES_IN };
};

export const generateDownloadUrl = async (input: {
  key: string;
}): Promise<DownloadUrlResult> => {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: input.key,
  });

  const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: DOWNLOAD_EXPIRES_IN });

  return { downloadUrl, expiresIn: DOWNLOAD_EXPIRES_IN };
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
