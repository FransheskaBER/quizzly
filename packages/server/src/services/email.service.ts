import pino from 'pino';
import { resendClient } from '../config/resend.js';
import { env } from '../config/env.js';

const logger = pino({ name: 'email-service' });

export const sendVerificationEmail = async (to: string, token: string): Promise<void> => {
  const from = env.EMAIL_FROM;
  if (!from) {
    logger.warn({ to }, 'EMAIL_FROM not configured — skipping verification email');
    return;
  }

  const verifyUrl = `${env.CLIENT_URL}/verify-email?token=${token}`;

  try {
    await resendClient.emails.send({
      from,
      to,
      subject: 'Verify your email address',
      html: `
        <p>Thanks for signing up! Please verify your email address by clicking the link below:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>This link expires in 24 hours.</p>
        <p>If you didn't create an account, you can safely ignore this email.</p>
      `,
      text: `Thanks for signing up! Verify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`,
    });
  } catch (err) {
    logger.error({ err, to }, 'Failed to send verification email');
  }
};

export const sendPasswordResetEmail = async (to: string, token: string): Promise<void> => {
  const from = env.EMAIL_FROM;
  if (!from) {
    logger.warn({ to }, 'EMAIL_FROM not configured — skipping password reset email');
    return;
  }

  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${token}`;

  try {
    await resendClient.emails.send({
      from,
      to,
      subject: 'Reset your password',
      html: `
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
      text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
    });
  } catch (err) {
    logger.error({ err, to }, 'Failed to send password reset email');
  }
};
