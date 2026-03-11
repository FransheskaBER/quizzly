import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';

import {
  updateProfileSchema,
  changePasswordSchema,
  saveApiKeySchema,
  PASSWORD_MIN_LENGTH,
} from '@skills-trainer/shared';
import type {
  UpdateProfileRequest,
  ChangePasswordRequest,
  SaveApiKeyRequest,
} from '@skills-trainer/shared';

import { useGetMeQuery } from '@/api/auth.api';
import {
  useGetApiKeyStatusQuery,
  useSaveApiKeyMutation,
  useDeleteApiKeyMutation,
  useUpdateProfileMutation,
  useChangePasswordMutation,
} from '@/api/user.api';
import { authApi } from '@/api/auth.api';
import { FormField } from '@/components/common/FormField';
import { FormError } from '@/components/common/FormError';
import { Button } from '@/components/common/Button';
import { parseApiError } from '@/hooks/useApiError';
import { useAppDispatch } from '@/store/store';
import styles from './ProfilePage.module.css';

const UsernameSection = () => {
  const { data: meData } = useGetMeQuery();
  const dispatch = useAppDispatch();
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileRequest>({
    resolver: zodResolver(updateProfileSchema),
    values: { username: meData?.username ?? '' },
  });

  const onSubmit = async (data: UpdateProfileRequest): Promise<void> => {
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      await updateProfile(data).unwrap();
      void dispatch(authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true }));
      setSuccessMessage('Username updated.');
    } catch (err) {
      setErrorMessage(parseApiError(err).message);
    }
  };

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Username</h2>
      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <FormField label="Username" {...register('username')} error={errors.username?.message} />
        <FormError message={errorMessage} />
        <div className={styles.actions}>
          <Button type="submit" disabled={isLoading || !isDirty}>
            {isLoading ? 'Saving…' : 'Save'}
          </Button>
          {successMessage && <span className={styles.successMessage}>{successMessage}</span>}
        </div>
      </form>
    </div>
  );
};

const PasswordSection = () => {
  const [changePassword, { isLoading }] = useChangePasswordMutation();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordRequest>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = async (data: ChangePasswordRequest): Promise<void> => {
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const result = await changePassword(data).unwrap();
      setSuccessMessage(result.message);
      reset();
    } catch (err) {
      setErrorMessage(parseApiError(err).message);
    }
  };

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Change Password</h2>
      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <FormField
          label="Current Password"
          type="password"
          {...register('currentPassword')}
          error={errors.currentPassword?.message}
        />
        <FormField
          label="New Password"
          type="password"
          {...register('newPassword')}
          error={errors.newPassword?.message}
        />
        <p className={styles.hint}>Minimum {PASSWORD_MIN_LENGTH} characters</p>
        <FormError message={errorMessage} />
        <div className={styles.actions}>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Changing…' : 'Change Password'}
          </Button>
          {successMessage && <span className={styles.successMessage}>{successMessage}</span>}
        </div>
      </form>
    </div>
  );
};

const ApiKeySection = () => {
  const dispatch = useAppDispatch();
  const { data: keyStatus, isLoading: isLoadingStatus } = useGetApiKeyStatusQuery();
  const [saveApiKey, { isLoading: isSaving }] = useSaveApiKeyMutation();
  const [deleteApiKey, { isLoading: isDeleting }] = useDeleteApiKeyMutation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SaveApiKeyRequest>({
    resolver: zodResolver(saveApiKeySchema),
  });

  const onSave = async (data: SaveApiKeyRequest): Promise<void> => {
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      await saveApiKey(data).unwrap();
      void dispatch(authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true }));
      setSuccessMessage('API key saved.');
      reset();
    } catch (err) {
      setErrorMessage(parseApiError(err).message);
    }
  };

  const onDelete = async (): Promise<void> => {
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      await deleteApiKey().unwrap();
      void dispatch(authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true }));
      setShowDeleteConfirm(false);
      setSuccessMessage('API key removed.');
    } catch (err) {
      setErrorMessage(parseApiError(err).message);
    }
  };

  if (isLoadingStatus) return null;

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Anthropic API Key</h2>
      <FormError message={errorMessage} />

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
          {successMessage && <span className={styles.successMessage}>{successMessage}</span>}
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
            {successMessage && <span className={styles.successMessage}>{successMessage}</span>}
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
        <UsernameSection />
        <PasswordSection />
        <ApiKeySection />
      </div>
    </div>
  );
};

export default ProfilePage;
