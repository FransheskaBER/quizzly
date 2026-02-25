import { S3Client } from '@aws-sdk/client-s3';
import { RequestChecksumCalculation } from '@aws-sdk/middleware-flexible-checksums';
import { env } from './env.js';

// In test mode AWS vars are optional — fall back to empty strings.
// The S3 client is mocked in all test suites so it is never called.
//
// requestChecksumCalculation: WHEN_REQUIRED — SDK v3 defaults to CRC32 checksums
// for PutObject. Presigned URLs include those params, but the browser upload does
// not send them, causing SignatureDoesNotMatch. WHEN_REQUIRED disables automatic
// checksum for PutObject (requestChecksumRequired: false), so presigned URLs work.
export const s3Client = new S3Client({
  region: env.AWS_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? '',
  },
  requestChecksumCalculation: RequestChecksumCalculation.WHEN_REQUIRED,
});

export const bucketName = env.S3_BUCKET_NAME ?? '';
