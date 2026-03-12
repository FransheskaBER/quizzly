import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuizPreferences } from './QuizPreferences';
import { AnswerFormat, MIN_QUESTION_COUNT, MAX_QUESTION_COUNT } from '@skills-trainer/shared';

describe('QuizPreferences', () => {
  const defaultProps = {
    onGenerate: vi.fn(),
    isDisabled: false,
    error: null,
  };

  it('shows free trial hint when isByok is false', () => {
    render(<QuizPreferences {...defaultProps} />);

    expect(screen.getByText(/free trial/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/questions/i)).not.toBeInTheDocument();
  });

  it('hides format controls when isByok is false', () => {
    render(<QuizPreferences {...defaultProps} />);

    expect(screen.queryByText(/^format$/i)).not.toBeInTheDocument();
  });

  it('shows count input with correct min and max when isByok is true', () => {
    render(<QuizPreferences {...defaultProps} isByok />);

    const countInput = screen.getByLabelText(/questions/i);
    expect(countInput).toBeInTheDocument();
    expect(countInput).toHaveAttribute('min', String(MIN_QUESTION_COUNT));
    expect(countInput).toHaveAttribute('max', String(MAX_QUESTION_COUNT));
  });

  it('hides free trial hint when isByok is true', () => {
    render(<QuizPreferences {...defaultProps} isByok />);

    expect(screen.queryByText(/free trial/i)).not.toBeInTheDocument();
  });

  it('shows format controls when isByok is true', () => {
    render(<QuizPreferences {...defaultProps} isByok />);

    expect(screen.getByText(/^format$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/multiple choice/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/free text/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mixed/i)).toBeInTheDocument();
  });

  it('submits MCQ format in free-trial mode', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(<QuizPreferences {...defaultProps} onGenerate={onGenerate} />);

    await user.click(screen.getByRole('button', { name: /generate quiz/i }));

    const payload = onGenerate.mock.calls[0]?.[0];
    expect(payload).toEqual(expect.objectContaining({ format: AnswerFormat.MCQ }));
  });
});
