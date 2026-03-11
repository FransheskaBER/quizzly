import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../utils/encryption.utils.js', () => ({
  encrypt: vi.fn((plaintext: string) => `encrypted-${plaintext}`),
}));

vi.mock('../../utils/password.utils.js', () => ({
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
}));

import { prisma } from '../../config/database.js';
import { encrypt } from '../../utils/encryption.utils.js';
import { hashPassword, comparePassword } from '../../utils/password.utils.js';
import * as userService from '../user.service.js';
import { NotFoundError, UnauthorizedError } from '../../utils/errors.js';

const USER_ID = 'user-uuid-111';

const mockUser = {
  id: USER_ID,
  email: 'test@example.com',
  username: 'testuser',
  passwordHash: 'hashed_password',
  emailVerified: true,
  encryptedApiKey: null,
  apiKeyHint: null,
  freeTrialUsedAt: null,
  createdAt: new Date('2026-01-01'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getApiKeyStatus
// ---------------------------------------------------------------------------

describe('getApiKeyStatus', () => {
  it('returns hasApiKey:false and hint:null when no key is saved', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      encryptedApiKey: null,
      apiKeyHint: null,
    } as never);

    const result = await userService.getApiKeyStatus(USER_ID);

    expect(result).toEqual({ hasApiKey: false, hint: null });
  });

  it('returns hasApiKey:true and the hint when a key is saved', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      encryptedApiKey: 'encrypted-data',
      apiKeyHint: 'sk-ant-...7890',
    } as never);

    const result = await userService.getApiKeyStatus(USER_ID);

    expect(result).toEqual({ hasApiKey: true, hint: 'sk-ant-...7890' });
  });

  it('throws NotFoundError when user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(userService.getApiKeyStatus(USER_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// saveApiKey
// ---------------------------------------------------------------------------

describe('saveApiKey', () => {
  it('encrypts the key and stores it with a masked hint', async () => {
    vi.mocked(prisma.user.update).mockResolvedValue(mockUser as never);

    const result = await userService.saveApiKey(USER_ID, 'sk-ant-api03-abcdef1234567890');

    expect(encrypt).toHaveBeenCalledWith('sk-ant-api03-abcdef1234567890');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: {
        encryptedApiKey: 'encrypted-sk-ant-api03-abcdef1234567890',
        apiKeyHint: 'sk-ant-...7890',
      },
    });
    expect(result).toEqual({ hasApiKey: true, hint: 'sk-ant-...7890' });
  });
});

// ---------------------------------------------------------------------------
// deleteApiKey
// ---------------------------------------------------------------------------

describe('deleteApiKey', () => {
  it('sets encryptedApiKey and apiKeyHint to null', async () => {
    vi.mocked(prisma.user.update).mockResolvedValue(mockUser as never);

    await userService.deleteApiKey(USER_ID);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { encryptedApiKey: null, apiKeyHint: null },
    });
  });
});

// ---------------------------------------------------------------------------
// updateProfile
// ---------------------------------------------------------------------------

describe('updateProfile', () => {
  it('updates the username and returns the user response', async () => {
    vi.mocked(prisma.user.update).mockResolvedValue({
      ...mockUser,
      username: 'newname',
    } as never);

    const result = await userService.updateProfile(USER_ID, { username: 'newname' });

    expect(result.username).toBe('newname');
    expect(result.id).toBe(USER_ID);
    expect(result.hasApiKey).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// changePassword
// ---------------------------------------------------------------------------

describe('changePassword', () => {
  it('returns success message when current password is correct', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      passwordHash: 'hashed_old',
    } as never);
    vi.mocked(comparePassword).mockResolvedValue(true);
    vi.mocked(hashPassword).mockResolvedValue('hashed_new');
    vi.mocked(prisma.user.update).mockResolvedValue(mockUser as never);

    const result = await userService.changePassword(USER_ID, {
      currentPassword: 'old-password',
      newPassword: 'new-password-123',
    });

    expect(result.message).toBe('Password changed successfully.');
    expect(comparePassword).toHaveBeenCalledWith('old-password', 'hashed_old');
    expect(hashPassword).toHaveBeenCalledWith('new-password-123');
  });

  it('throws UnauthorizedError when current password is wrong', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      passwordHash: 'hashed_old',
    } as never);
    vi.mocked(comparePassword).mockResolvedValue(false);

    await expect(
      userService.changePassword(USER_ID, {
        currentPassword: 'wrong-password',
        newPassword: 'new-password-123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws NotFoundError when user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(
      userService.changePassword(USER_ID, {
        currentPassword: 'old',
        newPassword: 'new-pass-123',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
