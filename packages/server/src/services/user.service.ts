import { ANTHROPIC_KEY_PREFIX } from '@skills-trainer/shared';
import type {
  ApiKeyStatusResponse,
  UpdateProfileRequest,
  ChangePasswordRequest,
  MessageResponse,
  UserResponse,
} from '@skills-trainer/shared';

import { prisma } from '../config/database.js';
import { encrypt } from '../utils/encryption.utils.js';
import { hashPassword, comparePassword } from '../utils/password.utils.js';
import { NotFoundError, UnauthorizedError } from '../utils/errors.js';

const API_KEY_HINT_SUFFIX_LENGTH = 4;

/** Builds a masked hint like `sk-ant-...xxxx` from a raw API key. */
const buildApiKeyHint = (apiKey: string): string => {
  const suffix = apiKey.slice(-API_KEY_HINT_SUFFIX_LENGTH);
  return `${ANTHROPIC_KEY_PREFIX}...${suffix}`;
};

export const getApiKeyStatus = async (userId: string): Promise<ApiKeyStatusResponse> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { encryptedApiKey: true, apiKeyHint: true },
  });

  if (!user) throw new NotFoundError('User not found');

  return {
    hasApiKey: user.encryptedApiKey !== null,
    hint: user.apiKeyHint,
  };
};

export const saveApiKey = async (
  userId: string,
  apiKey: string,
): Promise<ApiKeyStatusResponse> => {
  const encryptedApiKey = encrypt(apiKey);
  const apiKeyHint = buildApiKeyHint(apiKey);

  await prisma.user.update({
    where: { id: userId },
    data: { encryptedApiKey, apiKeyHint },
  });

  return { hasApiKey: true, hint: apiKeyHint };
};

export const deleteApiKey = async (userId: string): Promise<void> => {
  await prisma.user.update({
    where: { id: userId },
    data: { encryptedApiKey: null, apiKeyHint: null },
  });
};

export const updateProfile = async (
  userId: string,
  data: UpdateProfileRequest,
): Promise<UserResponse> => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { username: data.username },
  });

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    emailVerified: user.emailVerified,
    hasUsedFreeTrial: user.freeTrialUsedAt !== null,
    hasApiKey: user.encryptedApiKey !== null,
    createdAt: user.createdAt.toISOString(),
  };
};

export const changePassword = async (
  userId: string,
  data: ChangePasswordRequest,
): Promise<MessageResponse> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (!user) throw new NotFoundError('User not found');

  const isMatch = await comparePassword(data.currentPassword, user.passwordHash);
  if (!isMatch) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  const newHash = await hashPassword(data.newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });

  return { message: 'Password changed successfully.' };
};
