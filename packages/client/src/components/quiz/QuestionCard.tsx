import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { QuestionType } from '@skills-trainer/shared';
import type { Question } from '@skills-trainer/shared';

import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { MCQOptions } from './MCQOptions';
import { FreeTextInput } from './FreeTextInput';
import styles from './QuestionCard.module.css';

interface QuestionCardProps {
  question: Question;
  currentAnswer: string | null;
  onAnswerChange: (questionId: string, answer: string) => void;
  totalQuestions: number;
}

const codeComponents = {
  code({ className, children }: { className?: string; children?: React.ReactNode }) {
    const language = /language-(\w+)/.exec(className ?? '')?.[1];
    const codeString = Array.isArray(children) ? children.join('') : String(children ?? '');
    if (!language) {
      return <code className={styles.inlineCode}>{children}</code>;
    }
    return (
      <SyntaxHighlighter
        style={oneDark as Record<string, React.CSSProperties>}
        language={language}
        PreTag="div"
      >
        {codeString.replace(/\n$/, '')}
      </SyntaxHighlighter>
    );
  },
};

const QuestionCardInner = ({
  question,
  currentAnswer,
  onAnswerChange,
  totalQuestions,
}: QuestionCardProps) => (
  <div className={styles.card}>
    <p className={styles.counter}>
      Question {question.questionNumber} of {totalQuestions}
    </p>

    <div className={styles.questionText}>
      <ReactMarkdown components={codeComponents}>{question.questionText}</ReactMarkdown>
    </div>

    <div className={styles.answerSection}>
      {question.questionType === QuestionType.MCQ && question.options ? (
        <MCQOptions
          options={question.options}
          selectedOption={currentAnswer}
          groupName={question.id}
          onSelect={(answer) => onAnswerChange(question.id, answer)}
        />
      ) : (
        <FreeTextInput
          value={currentAnswer ?? ''}
          onChange={(answer) => onAnswerChange(question.id, answer)}
        />
      )}
    </div>
  </div>
);

export const QuestionCard = memo((props: QuestionCardProps) => (
  <ErrorBoundary
    fallback={
      <div className={styles.errorFallback}>
        <p>Something went wrong displaying this question. Please try navigating to another question.</p>
      </div>
    }
  >
    <QuestionCardInner {...props} />
  </ErrorBoundary>
));

QuestionCard.displayName = 'QuestionCard';
