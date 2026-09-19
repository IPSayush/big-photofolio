/**
 * Profile Validation Schemas (Zod).
 * SEC-002: All profile inputs validated server-side.
 *
 * FR-PROFILE-001: Business name, logo, contact info, branding colors.
 */

const { z } = require('zod');

/** Hex color validation pattern */
const hexColorPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** FR-PROFILE-001: Update photographer profile */
const updateProfileSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, 'Business name is required')
    .max(200, 'Business name cannot exceed 200 characters')
    .optional(),
  logo: z
    .string()
    .max(1000)
    .nullable()
    .optional(),
  contactEmail: z
    .string()
    .email('Please provide a valid contact email')
    .trim()
    .toLowerCase()
    .max(255)
    .optional(),
  contactPhone: z
    .string()
    .trim()
    .max(20, 'Phone number cannot exceed 20 characters')
    .nullable()
    .optional(),
  brandingColors: z.object({
    primary: z
      .string()
      .regex(hexColorPattern, 'Primary color must be a valid hex color (e.g., #FF5733)')
      .optional(),
    secondary: z
      .string()
      .regex(hexColorPattern, 'Secondary color must be a valid hex color (e.g., #FFFFFF)')
      .optional(),
  }).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update.' }
);

module.exports = { updateProfileSchema };
