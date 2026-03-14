import { describe, it, expect } from 'vitest';

import reducer, {
  generationStarted,
  questionFailed,
  generationReset,
  type FailedSlot,
} from './quizStream.slice';

describe('quizStream.slice — questionFailed', () => {
  it('adds a failed slot to failedSlots array', () => {
    const startedState = reducer(undefined, generationStarted(5));

    const failedSlot: FailedSlot = {
      questionNumber: 3,
      message: 'This question could not be generated.',
    };

    const nextState = reducer(startedState, questionFailed(failedSlot));

    expect(nextState.failedSlots).toHaveLength(1);
    expect(nextState.failedSlots[0]).toEqual(failedSlot);
  });

  it('accumulates multiple failed slots', () => {
    let state = reducer(undefined, generationStarted(5));
    state = reducer(state, questionFailed({ questionNumber: 2, message: 'Failed Q2' }));
    state = reducer(state, questionFailed({ questionNumber: 4, message: 'Failed Q4' }));

    expect(state.failedSlots).toHaveLength(2);
    expect(state.failedSlots[0].questionNumber).toBe(2);
    expect(state.failedSlots[1].questionNumber).toBe(4);
  });

  it('clears failedSlots on generationReset', () => {
    let state = reducer(undefined, generationStarted(5));
    state = reducer(state, questionFailed({ questionNumber: 1, message: 'Failed' }));

    expect(state.failedSlots).toHaveLength(1);

    const resetState = reducer(state, generationReset());

    expect(resetState.failedSlots).toHaveLength(0);
    expect(resetState.status).toBe('idle');
  });
});
