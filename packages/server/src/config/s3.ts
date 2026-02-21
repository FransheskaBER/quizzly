import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env.js';

// In test mode AWS vars are optional — fall back to empty strings.
// The S3 client is mocked in all test suites so it is never called.
export const s3Client = new S3Client({
  region: env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? '',
  },
});

export const bucketName = env.S3_BUCKET_NAME ?? '';
