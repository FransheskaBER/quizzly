import { TRANSIENT_STATUS_CODES } from '@/components/common/toast.constants';

export type ActionContext =
  | 'signup'
  | 'login'
  | 'resend-verification'
  | 'forgot-password'
  | 'reset-password'
  | 'verify-email'
  | 'create-session'
  | 'update-session'
  | 'delete-session'
  | 'upload-material'
  | 'delete-material'
  | 'generate-quiz'
  | 'submit-quiz'
  | 'save-answer'
  | 'regrade-quiz'
  | 'save-api-key'
  | 'delete-api-key';

export interface UserMessage {
  title: string;
  description: string;
}

type CodeMessageMap = Record<ActionContext, UserMessage> & { _default: UserMessage };
type ErrorMessageMap = Record<string, Partial<CodeMessageMap> & { _default: UserMessage }>;

const ERROR_MESSAGES: ErrorMessageMap = {
  VALIDATION_ERROR: {
    _default: {
      title: "Couldn't save that",
      description:
        'Some of the fields need fixing. Check the ones highlighted in red and try again.',
    },
  },
  BAD_REQUEST: {
    'verify-email': {
      title: "Couldn't verify your email",
      description:
        'This link has expired or was already used. Head to the login page and request a new one.',
    },
    'reset-password': {
      title: "Couldn't reset your password",
      description:
        'This link has expired or was already used. Head to the login page and request a new one.',
    },
    _default: {
      title: "Couldn't process that",
      description: "Something about the request didn't look right. Double-check your input and try again.",
    },
  },
  INVALID_KEY_FORMAT: {
    _default: {
      title: "Didn't recognize that API key",
      description: 'Anthropic keys start with "sk-ant-". Make sure you copied the whole thing and try again.',
    },
  },
  EMAIL_NOT_VERIFIED: {
    _default: {
      title: "Haven't verified your email yet",
      description: "Check your inbox for the verification link we sent you. Didn't get it? Hit 'Resend' below.",
    },
  },
  TRIAL_EXHAUSTED: {
    _default: {
      title: 'Ran out of free quizzes',
      description: "You've used all your free tries. Add your own Anthropic API key in Settings to keep going.",
    },
  },
  NOT_FOUND: {
    _default: {
      title: "Couldn't find that",
      description: "It might've been deleted or the link is wrong. Head back and try again.",
    },
  },
  CONFLICT: {
    signup: {
      title: "Couldn't create your account",
      description: 'That email is already taken. Try logging in instead, or use a different email.',
    },
    _default: {
      title: 'Ran into a conflict',
      description: 'Someone else may have changed this. Refresh the page and try again.',
    },
  },
  RATE_LIMITED: {
    _default: {
      title: 'Slow down a bit',
      description: "You've been doing that too fast. Wait about a minute and try again.",
    },
  },
  EMAIL_DELIVERY_ERROR: {
    signup: {
      title: "Created your account, but couldn't send the email",
      description:
        "You're all set up - we just couldn't send the verification email right now. Head to the login page and hit 'Resend' in a few minutes.",
    },
    'resend-verification': {
      title: "Couldn't send the verification email",
      description: 'Our email system is having a moment. Give it a few minutes and try again.',
    },
    'forgot-password': {
      title: "Couldn't send the reset email",
      description: 'Our email system is having a moment. Give it a few minutes and try again.',
    },
    _default: {
      title: "Couldn't send that email",
      description: 'Our email system is having a moment. Give it a few minutes and try again.',
    },
  },
  UNAUTHORIZED: {
    _default: {
      title: 'Lost your session',
      description: "You got signed out. Log back in and you'll be good to go.",
    },
  },
  FORBIDDEN: {
    _default: {
      title: "Can't do that",
      description:
        "You don't have permission for this one. If that seems wrong, try logging out and back in.",
    },
  },
};

const NETWORK_ERROR: UserMessage = {
  title: "Couldn't reach the server",
  description: 'Looks like you lost your connection. Check your internet and try again.',
};

const SERVER_ERROR_TRANSIENT: UserMessage = {
  title: 'Hit a snag',
  description: 'Something broke on our end - not your fault. Give it a few minutes and try again.',
};

const SERVER_ERROR_PERSISTENT: UserMessage = {
  title: 'Hit a snag',
  description: "Something broke on our end - not your fault. We're working on it, check back in a few hours.",
};

const UNKNOWN_ERROR: UserMessage = {
  title: "Couldn't do that",
  description: 'Something went wrong. Give it another shot.',
};

export const extractHttpStatus = (error: unknown): number | null => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'originalStatus' in error &&
    typeof (error as { originalStatus: unknown }).originalStatus === 'number'
  ) {
    return (error as { originalStatus: number }).originalStatus;
  }

  return null;
};

export const getUserMessage = (
  errorCode: string | null,
  actionContext: ActionContext | null,
  httpStatus: number | null,
): UserMessage => {
  if (errorCode && actionContext) {
    const codeMessages = ERROR_MESSAGES[errorCode];
    const contextMessage = codeMessages?.[actionContext];
    if (contextMessage) return contextMessage;
  }

  if (errorCode) {
    const codeMessages = ERROR_MESSAGES[errorCode];
    if (codeMessages?._default) return codeMessages._default;
  }

  if (httpStatus === null) return NETWORK_ERROR;

  if (httpStatus >= 500) {
    return TRANSIENT_STATUS_CODES.has(httpStatus) ? SERVER_ERROR_TRANSIENT : SERVER_ERROR_PERSISTENT;
  }

  return UNKNOWN_ERROR;
};
