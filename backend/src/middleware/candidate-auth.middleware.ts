import type { NextFunction, Request, Response } from "express";

import { rdb } from "../lib/recruitment-db.js";
import { verifyCandidateAccessToken } from "../modules/candidate-auth/candidate-auth.service.js";

type Row = Record<string, any>;

export interface CandidatePrincipal {
  applicationId: string;
  candidateId: string;
  sessionId: string;
  mustChangePassword: boolean;
}

declare global {
  namespace Express {
    interface Request {
      candidate?: CandidatePrincipal;
    }
  }
}

function reject(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, error: { code, message } });
}

export function authenticateCandidate(options: { allowPasswordChange?: boolean } = {}) {
  return async function candidateAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      return reject(res, 401, "UNAUTHORIZED", "Authentication required");
    }

    let claims: ReturnType<typeof verifyCandidateAccessToken>;

    try {
      claims = verifyCandidateAccessToken(header.slice(7).trim());
    } catch {
      return reject(res, 401, "UNAUTHORIZED", "Invalid or expired access token");
    }

    try {
      const db = rdb();
      const session: Row | null = await db.candidateSession.findUnique({ where: { id: claims.sessionId } });

      if (
        !session ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now() ||
        session.applicationId !== claims.applicationId ||
        session.candidateId !== claims.candidateId
      ) {
        return reject(res, 401, "UNAUTHORIZED", "Invalid or expired access token");
      }

      const [application, credential]: [Row | null, Row | null] = await Promise.all([
        db.application.findUnique({ where: { id: claims.applicationId } }),
        db.candidateCredential.findUnique({ where: { applicationId: claims.applicationId } }),
      ]);

      if (!application || !credential || application.candidateId !== claims.candidateId) {
        return reject(res, 401, "UNAUTHORIZED", "Invalid or expired access token");
      }

      const drive: Row | null = await db.drive.findUnique({ where: { id: application.driveId } });

      if (!drive || drive.deletedAt || !drive.isActive) {
        return reject(res, 403, "DRIVE_UNAVAILABLE", "This drive is not available");
      }

      if (credential.mustChangePassword && !options.allowPasswordChange) {
        return reject(res, 403, "PASSWORD_CHANGE_REQUIRED", "Choose a new password before continuing");
      }

      req.candidate = {
        applicationId: claims.applicationId,
        candidateId: claims.candidateId,
        sessionId: claims.sessionId,
        mustChangePassword: credential.mustChangePassword,
      };

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
