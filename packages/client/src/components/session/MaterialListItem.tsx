import { memo } from 'react';
import type { MaterialSummary } from '@skills-trainer/shared';
import styles from './MaterialListItem.module.css';

interface MaterialListItemProps {
  material: MaterialSummary;
  sessionId: string;
  onDelete: (materialId: string) => void;
}

const formatFileSize = (bytes: number | null): string => {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF',
  docx: 'DOCX',
  txt: 'TXT',
  url: 'URL',
};

export const MaterialListItem = memo(({ material, onDelete }: MaterialListItemProps) => {
  const typeLabel = FILE_TYPE_LABELS[material.fileType] ?? material.fileType.toUpperCase();
  const sizeText = formatFileSize(material.fileSize);

  return (
    <div className={styles.row}>
      <div className={styles.info}>
        <div className={styles.nameRow}>
          <span className={styles.typeTag}>{typeLabel}</span>
          <span className={styles.name} title={material.fileName}>
            {material.fileName}
          </span>
        </div>

        <div className={styles.meta}>
          {sizeText && <span>{sizeText}</span>}
          {sizeText && <span className={styles.dot}>·</span>}
          <span>{material.tokenCount.toLocaleString()} tokens</span>
          {material.fileType === 'url' && material.sourceUrl && (
            <>
              <span className={styles.dot}>·</span>
              <a
                href={material.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.sourceLink}
                title={material.sourceUrl}
              >
                {new URL(material.sourceUrl).hostname}
              </a>
            </>
          )}
        </div>

        {material.status === 'failed' && material.errorMessage && (
          <p className={styles.errorMessage}>{material.errorMessage}</p>
        )}
      </div>

      <div className={styles.right}>
        <span
          className={`${styles.statusBadge} ${styles[`status_${material.status}`]}`}
          data-testid="material-status"
        >
          {material.status}
        </span>
        <button
          className={styles.deleteBtn}
          onClick={() => onDelete(material.id)}
          aria-label={`Delete ${material.fileName}`}
          title="Delete material"
        >
          ✕
        </button>
      </div>
    </div>
  );
});
