import { useState, useRef } from 'react';
import type { MaterialSummary } from '@skills-trainer/shared';
import {
  MAX_FILES_PER_SESSION,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_FILE_TYPES,
} from '@skills-trainer/shared';
import {
  useGetUploadUrlMutation,
  useProcessMaterialMutation,
  useExtractUrlMutation,
  useDeleteMaterialMutation,
} from '@/api/materials.api';
import { uploadToS3 } from '@/utils/uploadToS3';
import { MaterialListItem } from './MaterialListItem';
import { parseApiError } from '@/hooks/useApiError';
import styles from './MaterialUploader.module.css';

interface UploadEntry {
  localId: string;
  fileName: string;
  progress: number;
  status: 'uploading' | 'processing' | 'error';
  error: string | null;
}

interface MaterialUploaderProps {
  sessionId: string;
  materials: MaterialSummary[];
}

export const MaterialUploader = ({ sessionId, materials }: MaterialUploaderProps) => {
  const [activeTab, setActiveTab] = useState<'file' | 'url'>('file');
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [getUploadUrl] = useGetUploadUrlMutation();
  const [processMaterial] = useProcessMaterialMutation();
  const [extractUrl, { isLoading: isExtractingUrl }] = useExtractUrlMutation();
  const [deleteMaterial] = useDeleteMaterialMutation();

  const activeUploadCount = uploads.filter((u) => u.status !== 'error').length;
  const totalCount = materials.length + activeUploadCount;
  const atLimit = totalCount >= MAX_FILES_PER_SESSION;

  const uploadFile = async (file: File): Promise<void> => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (!(ALLOWED_FILE_TYPES as readonly string[]).includes(ext)) {
      setFileError(`Only ${ALLOWED_FILE_TYPES.join(', ')} files are supported.`);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(`File must be under ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`);
      return;
    }

    if (totalCount >= MAX_FILES_PER_SESSION) {
      setFileError(`Maximum ${MAX_FILES_PER_SESSION} materials per session.`);
      return;
    }

    setFileError(null);

    const localId = crypto.randomUUID();
    setUploads((prev) => [
      ...prev,
      { localId, fileName: file.name, progress: 0, status: 'uploading', error: null },
    ]);

    try {
      const { uploadUrl, materialId } = await getUploadUrl({
        sessionId,
        fileName: file.name,
        fileType: ext,
        fileSize: file.size,
      }).unwrap();

      await uploadToS3(uploadUrl, file, (percent) => {
        setUploads((prev) =>
          prev.map((u) => (u.localId === localId ? { ...u, progress: percent } : u)),
        );
      });

      setUploads((prev) =>
        prev.map((u) =>
          u.localId === localId ? { ...u, status: 'processing', progress: 100 } : u,
        ),
      );

      await processMaterial({ sessionId, materialId }).unwrap();

      // processMaterial's invalidatesTags refreshes the Session cache, so the
      // newly processed material will appear in the materials list automatically.
      setUploads((prev) => prev.filter((u) => u.localId !== localId));
    } catch (err) {
      const { message } = parseApiError(err);
      setUploads((prev) =>
        prev.map((u) =>
          u.localId === localId ? { ...u, status: 'error', error: message } : u,
        ),
      );
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
    // Reset so the same file can be re-uploaded after dismissing an error
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void uploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError(null);

    const trimmed = urlInput.trim();
    if (!trimmed) {
      setUrlError('URL is required.');
      return;
    }

    try {
      new URL(trimmed);
    } catch {
      setUrlError('Enter a valid URL (e.g. https://example.com/article).');
      return;
    }

    if (atLimit) {
      setUrlError(`Maximum ${MAX_FILES_PER_SESSION} materials per session.`);
      return;
    }

    try {
      await extractUrl({ sessionId, url: trimmed }).unwrap();
      setUrlInput('');
    } catch (err) {
      const { message } = parseApiError(err);
      setUrlError(message);
    }
  };

  const handleDelete = async (materialId: string): Promise<void> => {
    try {
      await deleteMaterial({ sessionId, materialId }).unwrap();
    } catch {
      // Silent — user can retry by clicking delete again
    }
  };

  const dismissUpload = (localId: string) => {
    setUploads((prev) => prev.filter((u) => u.localId !== localId));
  };

  return (
    <div className={styles.uploader}>
      {/* Upload controls — hidden when at the limit */}
      {!atLimit && (
        <div className={styles.controls}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'file' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('file')}
            >
              Upload File
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === 'url' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('url')}
            >
              Add URL
            </button>
          </div>

          {activeTab === 'file' ? (
            <>
              <div
                className={styles.dropzone}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className={styles.hiddenInput}
                  onChange={handleFileInputChange}
                />
                <p className={styles.dropzoneText}>
                  Drop a file here or <span className={styles.browseLink}>browse</span>
                </p>
                <p className={styles.dropzoneHint}>
                  PDF, DOCX, TXT · Max {MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB
                </p>
              </div>
              {fileError && <p className={styles.fileError}>{fileError}</p>}
            </>
          ) : (
            <form onSubmit={(e) => void handleUrlSubmit(e)} className={styles.urlForm}>
              <div className={styles.urlInputRow}>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/article"
                  className={styles.urlInput}
                  disabled={isExtractingUrl}
                />
                <button
                  type="submit"
                  className={styles.urlSubmitBtn}
                  disabled={isExtractingUrl || !urlInput.trim()}
                >
                  {isExtractingUrl ? 'Adding…' : 'Add'}
                </button>
              </div>
              {urlError && <p className={styles.urlError}>{urlError}</p>}
            </form>
          )}
        </div>
      )}

      {atLimit && (
        <p className={styles.limitNote}>
          Maximum {MAX_FILES_PER_SESSION} materials reached. Delete a material to add another.
        </p>
      )}

      {/* In-flight uploads */}
      {uploads.length > 0 && (
        <div className={styles.uploadQueue}>
          {uploads.map((u) => (
            <div key={u.localId} className={styles.uploadEntry}>
              <div className={styles.uploadInfo}>
                <span className={styles.uploadFileName}>{u.fileName}</span>
                {u.status === 'uploading' && (
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${u.progress}%` }} />
                  </div>
                )}
                {u.status === 'processing' && (
                  <span className={styles.uploadStatus}>Processing…</span>
                )}
                {u.status === 'error' && u.error && (
                  <span className={styles.uploadError}>{u.error}</span>
                )}
              </div>
              {u.status === 'error' && (
                <button
                  className={styles.dismissBtn}
                  onClick={() => dismissUpload(u.localId)}
                  aria-label="Dismiss failed upload"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Persisted materials */}
      {materials.length > 0 && (
        <div className={styles.materialList}>
          {materials.map((m) => (
            <MaterialListItem
              key={m.id}
              material={m}
              sessionId={sessionId}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {materials.length === 0 && uploads.length === 0 && (
        <p className={styles.emptyText}>
          No materials yet. Upload a file or add a URL to get started.
        </p>
      )}
    </div>
  );
};
