import type { Request, Response, NextFunction } from "express";
import { getDashboardStats } from "./dashboard.service.js";

export async function getDashboardStatsController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const stats = await getDashboardStats();

    return res.status(200).json({
      success: true,
      message: "Dashboard statistics fetched successfully",
      data: stats,
    });
  } catch (error) {
    next(error);
  }
}
