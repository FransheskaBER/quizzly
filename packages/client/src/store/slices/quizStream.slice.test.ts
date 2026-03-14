import { describe, it, expect } from 'vitest';

import reducer, {
  generationStarted,
  questionsBatchReceived,
  questionFailed,
  generationReset,
  type FailedSlot,
} from './quizStream.slice';
import type { Question } from '@skills-trainer/shared';

const makeQuestion = (id: string, num: number): Question => ({
  id,
  questionNumber: num,
  questionType: 'mcq',
  questionText: `Q${num}?`,
  options: ['A', 'B'],
} as Question);

describe('quizStream.slice — questionsBatchReceived dedup', () => {
  it('does not add duplicate questions when dispatched twice with the same batch', () => {
    const batch = [makeQuestion('q1', 1), makeQuestion('q2', 2)];
    let state = reducer(undefined, generationStarted(5));
    state = reducer(state, questionsBatchReceived(batch));
    state = reducer(state, questionsBatchReceived(batch));

    expect(state.questions).toHaveLength(2);
  });

  it('adds only new questions when batch overlaps with existing', () => {
    const batch1 = [makeQuestion('q1', 1)];
    const batch2 = [makeQuestion('q1', 1), makeQuestion('q2', 2)];
    let state = reducer(undefined, generationStarted(5));
    state = reducer(state, questionsBatchReceived(batch1));
    state = reducer(state, questionsBatchReceived(batch2));

    expect(state.questions).toHaveLength(2);
    expect(state.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
  });
});

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
