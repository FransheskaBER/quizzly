import type { QuizDifficulty, AnswerFormat } from '@skills-trainer/shared';

export interface GenerationUserPromptParams {
  subject: string;
  goal: string;
  difficulty: QuizDifficulty;
  answerFormat: AnswerFormat;
  questionCount: number;
  materialsText: string | null;
}

export const buildGenerationUserMessage = (params: GenerationUserPromptParams): string => {
  const { subject, goal, difficulty, answerFormat, questionCount, materialsText } = params;

  return `<subject>
${subject}
</subject>

<goal>
${goal}
</goal>

<difficulty>
${difficulty}
</difficulty>

<answer_format>
${answerFormat}
</answer_format>

<question_count>
${questionCount}
</question_count>

<study_materials>
${materialsText ?? 'No materials provided.'}
</study_materials>

Please generate the exercises based on the provided system instructions and inputs.`.trim();
};
