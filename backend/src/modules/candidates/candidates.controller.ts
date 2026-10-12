import type { Request, Response } from "express";

import { getAuditActor } from "../../lib/audit.js";

import {
  createCandidateSchema,
  updateCandidateSchema,
  candidateIdSchema,
  candidateListQuerySchema,
} from "./candidates.schema.js";

import {
  listCandidates,
  getCandidateById,
  createCandidate,
  updateCandidate,
  deleteCandidate,
} from "./candidates.service.js";

export async function listCandidatesController(
  req: Request,
  res: Response,
) {
  const query = candidateListQuerySchema.parse(
    req.query,
  );

  const result = await listCandidates(query);

  return res.status(200).json({
    success: true,
    ...result,
  });
}

export async function getCandidateController(
  req: Request,
  res: Response,
) {
  const { id } = candidateIdSchema.parse(req.params);

  const candidate = await getCandidateById(id);

  if (!candidate) {
    return res.status(404).json({
      success: false,
      error: {
        code: "CANDIDATE_NOT_FOUND",
        message: "Candidate not found",
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: candidate,
  });
}

export async function createCandidateController(
  req: Request,
  res: Response,
) {
  const input = createCandidateSchema.parse(req.body);

  const candidate = await createCandidate(input, getAuditActor(req));

  if (!candidate) {
    return res.status(404).json({
      success: false,
      error: {
        code: "COLLEGE_NOT_FOUND",
        message:
          "Selected college was not found or is inactive",
      },
    });
  }

  return res.status(201).json({
    success: true,
    data: candidate,
  });
}

export async function updateCandidateController(
  req: Request,
  res: Response,
) {
  const { id } = candidateIdSchema.parse(req.params);
  const input = updateCandidateSchema.parse(req.body);

  const candidate = await updateCandidate(id, input, getAuditActor(req));

  if (!candidate) {
    return res.status(404).json({
      success: false,
      error: {
        code: "CANDIDATE_NOT_FOUND",
        message:
          "Candidate not found or selected college is invalid",
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: candidate,
  });
}

export async function deleteCandidateController(
  req: Request,
  res: Response,
) {
  const { id } = candidateIdSchema.parse(req.params);

  const candidate = await deleteCandidate(id, getAuditActor(req));

  if (!candidate) {
    return res.status(404).json({
      success: false,
      error: {
        code: "CANDIDATE_NOT_FOUND",
        message: "Candidate not found",
      },
    });
  }

  return res.status(200).json({
    success: true,
    data: candidate,
  });
}