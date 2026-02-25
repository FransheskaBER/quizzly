import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

import { useGetSessionQuery, useUpdateSessionMutation, useDeleteSessionMutation } from '@/api/sessions.api';
import { SessionForm } from '@/components/session/SessionForm';
import { MaterialUploader } from '@/components/session/MaterialUploader';
import { ComponentErrorBoundary } from '@/components/common/ErrorBoundary';
import { Modal } from '@/components/common/Modal';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { FormError } from '@/components/common/FormError';
import { parseApiError } from '@/hooks/useApiError';
import { useQuizGeneration } from '@/hooks/useQuizGeneration';
import { QuizPreferences } from '@/components/quiz/QuizPreferences';
import { QuizProgress } from '@/components/quiz/QuizProgress';
import { formatDate, formatScore } from '@/utils/formatters';
import { QuizStatus, type CreateSessionRequest, type QuizAttemptSummary } from '@skills-trainer/shared';
import styles from './SessionDashboardPage.module.css';

const isFetchError = (err: unknown): err is { status: number } =>
  typeof err === 'object' && err !== null && 'status' in err;

const SessionDashboardPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const { data: session, isLoading, error } = useGetSessionQuery(id ?? '');
  const [updateSession, { isLoading: isUpdating, error: updateError }] = useUpdateSessionMutation();
  const [deleteSession, { isLoading: isDeleting }] = useDeleteSessionMutation();

  const {
    generate,
    status: generationStatus,
    questions,
    quizAttemptId,
    error: generationError,
    totalExpected,
    warning,
    progressMessage,
    reset: resetGeneration,
  } = useQuizGeneration(id ?? '');

  if (isLoading) return <LoadingSpinner fullPage />;

  if (error) {
    if (isFetchError(error) && error.status === 404) {
      return (
        <div className={styles.page}>
          <div className={styles.notFound}>
            <h2>Session not found</h2>
            <Link to="/sessions">← Back to sessions</Link>
          </div>
        </div>
      );
    }
    const { message } = parseApiError(error);
    return (
      <div className={styles.page}>
        <FormError message={message} />
      </div>
    );
  }

  if (!session) return null;

  const handleUpdate = async (data: CreateSessionRequest) => {
    await updateSession({ id: session.id, data }).unwrap();
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteSession(session.id).unwrap();
    navigate('/sessions');
  };

  const { message: updateErrorMessage } = updateError
    ? parseApiError(updateError)
    : { message: undefined };

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {/* Back nav */}
        <Link to="/sessions" className={styles.backLink}>
          ← Sessions
        </Link>

        {/* Session header */}
        <div className={styles.section}>
          {isEditing ? (
            <SessionForm
              mode="edit"
              defaultValues={{ name: session.name, subject: session.subject, goal: session.goal }}
              onSubmit={handleUpdate}
              onCancel={() => setIsEditing(false)}
              isLoading={isUpdating}
              error={updateErrorMessage}
            />
          ) : (
            <div className={styles.sessionHeader}>
              <div className={styles.sessionMeta}>
                <h1 className={styles.sessionName}>{session.name}</h1>
                <span className={styles.sessionSubject}>{session.subject}</span>
              </div>
              <p className={styles.sessionGoal}>{session.goal}</p>
              <p className={styles.sessionDate}>Created {formatDate(session.createdAt)}</p>
              <div className={styles.headerActions}>
                <button className={styles.editBtn} onClick={() => setIsEditing(true)}>
                  Edit
                </button>
                <button className={styles.deleteBtn} onClick={() => setShowDeleteModal(true)}>
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Materials */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Materials <span className={styles.count}>({session.materials.length})</span>
          </h2>
          <ComponentErrorBoundary>
            <MaterialUploader sessionId={session.id} materials={session.materials} />
          </ComponentErrorBoundary>
        </div>

        {/* Generate quiz */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Generate Quiz</h2>
          <ComponentErrorBoundary>
            {generationStatus === 'idle' ? (
              <QuizPreferences onGenerate={generate} isDisabled={false} error={null} />
            ) : (
              <QuizProgress
                status={generationStatus}
                questions={questions}
                totalExpected={totalExpected}
                progressMessage={progressMessage}
                warning={warning}
                error={generationError}
                quizAttemptId={quizAttemptId}
                onReset={resetGeneration}
              />
            )}
          </ComponentErrorBoundary>
        </div>

        {/* Quiz attempts */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Quiz Attempts <span className={styles.count}>({session.quizAttempts.length})</span>
          </h2>
          {session.quizAttempts.length === 0 ? (
            <p className={styles.emptyText}>No quizzes yet. Generate a quiz to get started.</p>
          ) : (
            <div className={styles.quizList}>
              {session.quizAttempts.map((q: QuizAttemptSummary) => (
                <Link
                  key={q.id}
                  to={[QuizStatus.GRADING, QuizStatus.SUBMITTED_UNGRADED, QuizStatus.COMPLETED].includes(q.status) ? `/quiz/${q.id}/results` : `/quiz/${q.id}`}
                  className={styles.quizRow}
                >
                  <div className={styles.quizInfo}>
                    <span className={styles.quizDifficulty}>
                      {q.difficulty} · {q.answerFormat}
                    </span>
                    <span className={styles.quizMeta}>
                      {q.questionCount} questions
                      {q.score != null && ` · ${formatScore(q.score)}`}
                    </span>
                  </div>
                  <div className={styles.quizRight}>
                    <span className={`${styles.statusBadge} ${styles[`status_${q.status}`]}`}>
                      {q.status.replace('_', ' ')}
                    </span>
                    <span className={styles.quizDate}>{formatDate(q.createdAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={showDeleteModal}
        title="Delete this session?"
        onClose={() => setShowDeleteModal(false)}
      >
        <p className={styles.deleteWarning}>
          &ldquo;{session.name}&rdquo; and all its generated quizzes will be permanently removed.
          You cannot undo this action.
        </p>
        <div className={styles.modalActions}>
          <button
            className={styles.cancelBtn}
            onClick={() => setShowDeleteModal(false)}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button className={styles.confirmDeleteBtn} onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? 'Deleting…' : 'Delete Session'}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default SessionDashboardPage;
