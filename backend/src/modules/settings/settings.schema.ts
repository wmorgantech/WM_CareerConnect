import { z } from "zod";

import { httpUrl } from "../../lib/url.js";

export const updateSettingsSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(1, "Company name is required")
    .max(200, "Company name must not exceed 200 characters")
    .optional(),

  companyEmail: z
    .string()
    .trim()
    .email("Invalid company email")
    .max(255, "Company email must not exceed 255 characters")
    .optional(),

  companyPhone: z
    .string()
    .trim()
    .min(7, "Invalid company phone")
    .max(30, "Company phone must not exceed 30 characters")
    .optional(),

  companyAddress: z
    .string()
    .trim()
    .max(500, "Company address must not exceed 500 characters")
    .optional(),

  logoUrl: httpUrl("Invalid logo URL")
    .max(1000, "Logo URL must not exceed 1000 characters")
    .optional(),

  timezone: z
    .string()
    .trim()
    .min(1, "Timezone is required")
    .max(100, "Timezone must not exceed 100 characters")
    .optional(),
});

export type UpdateSettingsInput = z.infer<
  typeof updateSettingsSchema
>;