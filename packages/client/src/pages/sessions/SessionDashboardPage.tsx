import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { useGetSessionQuery, useUpdateSessionMutation, useDeleteSessionMutation } from '@/api/sessions.api';
import { useSubmitQuizMutation } from '@/api/quizzes.api';
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
import { api } from '@/store/api';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  submitFailureCleared,
  submitFailureReported,
  selectSubmitFailuresForSession,
} from '@/store/slices/quizSubmit.slice';
import styles from './SessionDashboardPage.module.css';

const isFetchError = (err: unknown): err is { status: number } =>
  typeof err === 'object' && err !== null && 'status' in err;

const SESSION_POLL_INTERVAL_MS = 3000;
const FEEDBACK_VIEWED_STORAGE_KEY = 'quiz-feedback-viewed-ids';
const LOCKED_RESULTS_STATUSES: QuizStatus[] = [QuizStatus.GRADING, QuizStatus.SUBMITTED_UNGRADED];

const readViewedFeedbackIds = (): string[] => {
  try {
    const raw = localStorage.getItem(FEEDBACK_VIEWED_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const persistViewedFeedbackIds = (ids: string[]): void => {
  localStorage.setItem(FEEDBACK_VIEWED_STORAGE_KEY, JSON.stringify(ids));
};

const SessionDashboardPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pollingActive, setPollingActive] = useState(true);
  const [viewedFeedbackIds, setViewedFeedbackIds] = useState<string[]>(() => readViewedFeedbackIds());
  const [retryingQuizAttemptId, setRetryingQuizAttemptId] = useState<string | null>(null);

  const { data: session, isLoading, error } = useGetSessionQuery(id ?? '', {
    skip: !id,
    pollingInterval: pollingActive ? SESSION_POLL_INTERVAL_MS : 0,
  });
  const [updateSession, { isLoading: isUpdating, error: updateError }] = useUpdateSessionMutation();
  const [deleteSession, { isLoading: isDeleting }] = useDeleteSessionMutation();
  const [submitQuiz] = useSubmitQuizMutation();

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

  useEffect(() => {
    if (!session) return;
    const hasPendingGrading = session.quizAttempts.some((q) =>
      LOCKED_RESULTS_STATUSES.includes(q.status),
    );
    setPollingActive(hasPendingGrading);
  }, [session]);

  const submitFailures = useAppSelector((state) =>
    session ? selectSubmitFailuresForSession(state, session.id) : [],
  );

  useEffect(() => {
    if (!session) return;
    const currentStatusById = new Map(session.quizAttempts.map((q) => [q.id, q.status]));
    for (const failure of submitFailures) {
      if (currentStatusById.get(failure.quizAttemptId) !== QuizStatus.IN_PROGRESS) {
        dispatch(submitFailureCleared(failure.quizAttemptId));
      }
    }
  }, [session, submitFailures, dispatch]);

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

  const markFeedbackViewed = (quizAttemptId: string): void => {
    if (viewedFeedbackIds.includes(quizAttemptId)) return;
    const next = [...viewedFeedbackIds, quizAttemptId];
    setViewedFeedbackIds(next);
    persistViewedFeedbackIds(next);
  };

  const sessionSubmitFailure = submitFailures[0];

  const handleRetrySubmission = async (quizAttemptId: string) => {
    try {
      setRetryingQuizAttemptId(quizAttemptId);
      await submitQuiz({ id: quizAttemptId, answers: [] }).unwrap();
      dispatch(submitFailureCleared(quizAttemptId));
      dispatch(api.util.invalidateTags([{ type: 'Session', id: session.id }]));
    } catch (err) {
      const fbqErr = err as FetchBaseQueryError;
      const isStreamStarted =
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        fbqErr.status === 'PARSING_ERROR' &&
        typeof fbqErr.originalStatus === 'number' &&
        fbqErr.originalStatus >= 200 &&
        fbqErr.originalStatus < 300;

      if (isStreamStarted) {
        dispatch(submitFailureCleared(quizAttemptId));
        dispatch(api.util.invalidateTags([{ type: 'Session', id: session.id }]));
      } else {
        dispatch(
          submitFailureReported({
            quizAttemptId,
            sessionId: session.id,
            message: parseApiError(err).message,
            createdAt: new Date().toISOString(),
          }),
        );
      }
    } finally {
      setRetryingQuizAttemptId((current) => (current === quizAttemptId ? null : current));
    }
  };

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
          {sessionSubmitFailure && (
            <div className={styles.submitFailureNotice}>
              <p className={styles.submitFailureText}>
                We couldn&apos;t submit your quiz. {sessionSubmitFailure.message}
              </p>
              <button
                type="button"
                className={styles.submitFailureLink}
                onClick={() => void handleRetrySubmission(sessionSubmitFailure.quizAttemptId)}
                disabled={retryingQuizAttemptId === sessionSubmitFailure.quizAttemptId}
              >
                {retryingQuizAttemptId === sessionSubmitFailure.quizAttemptId
                  ? 'Retrying…'
                  : 'Retry Submission'}
              </button>
            </div>
          )}
          {session.quizAttempts.length === 0 ? (
            <p className={styles.emptyText}>No quizzes yet. Generate a quiz to get started.</p>
          ) : (
            <div className={styles.quizList}>
              {session.quizAttempts.map((q: QuizAttemptSummary) => {
                const isFeedbackPending = LOCKED_RESULTS_STATUSES.includes(q.status);
                const showViewFeedbackPrompt =
                  q.status === QuizStatus.COMPLETED && !viewedFeedbackIds.includes(q.id);

                if (isFeedbackPending) {
                  return (
                    <div key={q.id} className={`${styles.quizRow} ${styles.quizRowDisabled}`}>
                      <div className={styles.quizInfo}>
                        <span className={styles.quizDifficulty}>
                          {q.difficulty} · {q.answerFormat}
                        </span>
                        <span className={styles.quizMeta}>
                          {q.questionCount} questions
                          {q.score != null && ` · ${formatScore(q.score)}`}
                        </span>
                        <span className={styles.quizWaitingMessage}>
                          Your feedback will be available in a few minutes.
                        </span>
                      </div>
                      <div className={styles.quizRight}>
                        <span className={`${styles.statusBadge} ${styles[`status_${q.status}`]}`}>
                          {q.status.replace('_', ' ')}
                        </span>
                        <span className={styles.quizDate}>{formatDate(q.createdAt)}</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <Link
                    key={q.id}
                    to={q.status === QuizStatus.COMPLETED ? `/quiz/${q.id}/results` : `/quiz/${q.id}`}
                    className={styles.quizRow}
                    onClick={() => {
                      if (showViewFeedbackPrompt) {
                        markFeedbackViewed(q.id);
                      }
                    }}
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
                      {showViewFeedbackPrompt && (
                        <span className={styles.feedbackCta}>View Feedback</span>
                      )}
                      <span className={`${styles.statusBadge} ${styles[`status_${q.status}`]}`}>
                        {q.status.replace('_', ' ')}
                      </span>
                      <span className={styles.quizDate}>{formatDate(q.createdAt)}</span>
                    </div>
                  </Link>
                );
              })}
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
