import type { QuizDifficulty, AnswerFormat } from '@skills-trainer/shared';

interface GenerationUserPromptParams {
  subject: string;
  goal: string;
  difficulty: QuizDifficulty;
  answerFormat: AnswerFormat;
  questionCount: number;
  materialsText: string | null;
}

export const buildGenerationUserMessage = (params: GenerationUserPromptParams): string => {
  const { subject, goal, difficulty, answerFormat, questionCount, materialsText } = params;

  return `<subject>${subject}</subject>
<goal>${goal}</goal>
<difficulty>${difficulty}</difficulty>
<answer_format>${answerFormat}</answer_format>
<question_count>${questionCount}</question_count>
<materials_provided>${materialsText !== null}</materials_provided>
<materials>${materialsText ?? 'No materials provided.'}</materials>

Generate ${questionCount} ${difficulty} difficulty quiz question(s) in ${answerFormat} format based on the subject and goal above.`.trim();
};
