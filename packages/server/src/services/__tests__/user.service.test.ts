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

import { prisma } from '../../config/database.js';
import { encrypt } from '../../utils/encryption.utils.js';
import * as userService from '../user.service.js';
import { NotFoundError } from '../../utils/errors.js';

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

