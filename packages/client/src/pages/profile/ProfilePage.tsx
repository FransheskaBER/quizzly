import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';

import { saveApiKeySchema } from '@skills-trainer/shared';
import type { SaveApiKeyRequest } from '@skills-trainer/shared';

import {
  useGetApiKeyStatusQuery,
  useSaveApiKeyMutation,
  useDeleteApiKeyMutation,
} from '@/api/user.api';
import { authApi } from '@/api/auth.api';
import { FormField } from '@/components/common/FormField';
import { Button } from '@/components/common/Button';
import { parseApiError } from '@/hooks/useApiError';
import { useToast } from '@/hooks/useToast';
import { extractHttpStatus, getUserMessage } from '@/utils/error-messages';
import { useAppDispatch } from '@/store/store';
import { Sentry } from '@/config/sentry';
import styles from './ProfilePage.module.css';

const ApiKeySection = () => {
  const { showError, showSuccess } = useToast();
  const dispatch = useAppDispatch();
  const { data: keyStatus, isLoading: isLoadingStatus } = useGetApiKeyStatusQuery();
  const [saveApiKey, { isLoading: isSaving }] = useSaveApiKeyMutation();
  const [deleteApiKey, { isLoading: isDeleting }] = useDeleteApiKeyMutation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SaveApiKeyRequest>({
    resolver: zodResolver(saveApiKeySchema),
  });

  const onSave = async (data: SaveApiKeyRequest): Promise<void> => {
    try {
      await saveApiKey(data).unwrap();
      void dispatch(authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true }));
      showSuccess('Saved your API key');
      reset();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Save API key failed:', err);
      Sentry.captureException(err, {
        extra: {
          operation: 'saveApiKey',
        },
      });
      const { code } = parseApiError(err);
      const status = extractHttpStatus(err);
      const userMessage = getUserMessage(code, 'save-api-key', status);
      showError(userMessage.title, userMessage.description);
    }
  };

  const onDelete = async (): Promise<void> => {
    try {
      await deleteApiKey().unwrap();
      void dispatch(authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true }));
      setShowDeleteConfirm(false);
      showSuccess('Removed your API key');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Delete API key failed:', err);
      Sentry.captureException(err, {
        extra: {
          operation: 'deleteApiKey',
        },
      });
      const { code } = parseApiError(err);
      const status = extractHttpStatus(err);
      const userMessage = getUserMessage(code, 'delete-api-key', status);
      showError(userMessage.title, userMessage.description);
    }
  };

  if (isLoadingStatus) return null;

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Anthropic API Key</h2>

      {keyStatus?.hasApiKey ? (
        <>
          <div className={styles.keyStatus}>
            <span className={styles.keyHint}>{keyStatus.hint}</span>
            {showDeleteConfirm ? (
              <div className={styles.actions}>
                <Button variant="destructive" size="sm" onClick={onDelete} disabled={isDeleting}>
                  {isDeleting ? 'Removing…' : 'Confirm Remove'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                Remove
              </Button>
            )}
          </div>
        </>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit(onSave)} noValidate>
          <FormField
            label="API Key"
            type="password"
            placeholder="sk-ant-..."
            {...register('apiKey')}
            error={errors.apiKey?.message}
          />
          <p className={styles.hint}>Your key is encrypted at rest and never displayed in full.</p>
          <div className={styles.actions}>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Key'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};

const ProfilePage = () => {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <Link to="/dashboard" className={styles.backLink}>
          ← Dashboard
        </Link>
        <h1 className={styles.sectionTitle}>Your API Key</h1>
        <ApiKeySection />
      </div>
    </div>
  );
};

export default ProfilePage;
