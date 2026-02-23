import type { Response } from 'express';

export interface SseEvent {
  type: string;
  data?: unknown;
  message?: string;
}

export type SseWriter = (event: SseEvent) => void;

export function sendSSEEvent(res: Response, event: SseEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
