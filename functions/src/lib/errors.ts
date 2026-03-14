import { Response } from 'express';
import { ApiError } from '../types/index.js';

export function sendError(res: Response, status: number, error: string, message: string, details?: Record<string, unknown>): void {
  const body: ApiError = { error, message };
  if (details) body.details = details;
  res.status(status).json(body);
}

export function sendPhaseClosed(res: Response, phase: string, closedDate: string, nextPhase?: { phase: string; opens: string }): void {
  const body: ApiError & { next?: { phase: string; opens: string } } = {
    error: 'phase_closed',
    message: `${phase} closed ${closedDate}`,
  };
  if (nextPhase) (body as any).next = nextPhase;
  res.status(403).json(body);
}
