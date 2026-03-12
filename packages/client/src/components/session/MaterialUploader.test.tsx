import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const {
  mockGetUploadUrl,
  mockProcessMaterial,
  mockExtractUrl,
  mockDeleteMaterial,
  mockShowError,
  mockShowSuccess,
  mockCaptureException,
} = vi.hoisted(() => ({
  mockGetUploadUrl: vi.fn(),
  mockProcessMaterial: vi.fn(),
  mockExtractUrl: vi.fn(),
  mockDeleteMaterial: vi.fn(),
  mockShowError: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockCaptureException: vi.fn(),
}));

vi.mock('@/api/materials.api', () => ({
  useGetUploadUrlMutation: () => [mockGetUploadUrl],
  useProcessMaterialMutation: () => [mockProcessMaterial],
  useExtractUrlMutation: () => [mockExtractUrl, { isLoading: false }],
  useDeleteMaterialMutation: () => [mockDeleteMaterial],
}));
vi.mock('@/utils/uploadToS3', () => ({
  uploadToS3: vi.fn(),
}));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showError: mockShowError, showSuccess: mockShowSuccess }),
}));
vi.mock('@/config/sentry', () => ({
  Sentry: { captureException: mockCaptureException },
}));

import { MaterialUploader } from './MaterialUploader';

describe('MaterialUploader telemetry catches (FE-010)', () => {
  beforeEach(() => {
    mockGetUploadUrl.mockReset();
    mockProcessMaterial.mockReset();
    mockExtractUrl.mockReset();
    mockDeleteMaterial.mockReset();
    mockShowError.mockReset();
    mockShowSuccess.mockReset();
    mockCaptureException.mockReset();
  });

  it('captures uploadFile failures with session and file metadata', async () => {
    mockGetUploadUrl.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(new Error('upload failed')),
    });

    const { container } = render(
      <MaterialUploader sessionId="session-1" materials={[]} />,
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const testFile = new File(['content'], 'example.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [testFile] } });

    await waitFor(() => {
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: expect.objectContaining({
            operation: 'uploadFile',
            sessionId: 'session-1',
            fileName: 'example.pdf',
          }),
        }),
      );
    });
  });

  it('captures handleUrlSubmit failures with url metadata', async () => {
    const user = userEvent.setup();
    mockExtractUrl.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue(new Error('extract failed')),
    });

    render(<MaterialUploader sessionId="session-1" materials={[]} />);

    await user.click(screen.getByRole('button', { name: /add url/i }));
    await user.type(screen.getByPlaceholderText('https://example.com/article'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(mockCaptureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: expect.objectContaining({
            operation: 'handleUrlSubmit',
            sessionId: 'session-1',
            url: 'https://example.com',
          }),
        }),
      );
    });
  });
});
