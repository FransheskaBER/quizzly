import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuizPreferences } from './QuizPreferences';
import { MIN_QUESTION_COUNT, MAX_QUESTION_COUNT } from '@skills-trainer/shared';

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
});
