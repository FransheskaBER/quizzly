/**
 * Uploads a file directly to S3 via a presigned PUT URL.
 *
 * Uses XMLHttpRequest instead of fetch because fetch has no upload progress API.
 * Progress events (0–100%) are reported via the optional onProgress callback.
 */
export const uploadToS3 = (
  presignedUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('S3 upload failed: network error'));
    xhr.ontimeout = () => reject(new Error('S3 upload timed out'));

    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
