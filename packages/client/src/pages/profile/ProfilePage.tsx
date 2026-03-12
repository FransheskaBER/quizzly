import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import {
  updateProfileSchema,
  changePasswordSchema,
  saveApiKeySchema,
  PASSWORD_MIN_LENGTH,
} from '@skills-trainer/shared';
import type {
  UpdateProfileRequest,
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
import { Button } from '@/components/common/Button';
import { parseApiError } from '@/hooks/useApiError';
import { useToast } from '@/hooks/useToast';
import { extractHttpStatus, getUserMessage } from '@/utils/error-messages';
import { useAppDispatch } from '@/store/store';
import styles from './ProfilePage.module.css';

/** Client-side schema that adds a confirm field and validates it matches newPassword. */
const changePasswordFormSchema = changePasswordSchema
  .extend({ confirmNewPassword: z.string().min(1, 'Please confirm your new password') })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'Passwords do not match',
    path: ['confirmNewPassword'],
  });

type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

const UsernameSection = () => {
  const { showError } = useToast();
  const { data: meData } = useGetMeQuery();
  const dispatch = useAppDispatch();
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
    try {
      await updateProfile(data).unwrap();
      void dispatch(authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true }));
      setSuccessMessage('Username updated.');
    } catch (err) {
      const { code } = parseApiError(err);
      const status = extractHttpStatus(err);
      const userMessage = getUserMessage(code, null, status);
      showError(userMessage.title, userMessage.description);
    }
  };

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Username</h2>
      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <FormField label="Username" {...register('username')} error={errors.username?.message} />
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
  const { showError } = useToast();
  const [changePassword, { isLoading }] = useChangePasswordMutation();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
  });

  const onSubmit = async (data: ChangePasswordFormValues): Promise<void> => {
    setSuccessMessage(null);
    try {
      const { currentPassword, newPassword } = data;
      const result = await changePassword({ currentPassword, newPassword }).unwrap();
      setSuccessMessage(result.message);
      reset();
    } catch (err) {
      const { code } = parseApiError(err);
      const status = extractHttpStatus(err);
      const userMessage = getUserMessage(code, null, status);
      showError(userMessage.title, userMessage.description);
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
        <FormField
          label="Confirm New Password"
          type="password"
          {...register('confirmNewPassword')}
          error={errors.confirmNewPassword?.message}
        />
        <p className={styles.hint}>Minimum {PASSWORD_MIN_LENGTH} characters</p>
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
        <UsernameSection />
        <PasswordSection />
        <ApiKeySection />
      </div>
    </div>
  );
};

export default ProfilePage;
