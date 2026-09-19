/**
 * Event Validation Schemas (Zod).
 * SEC-002: All event inputs validated server-side.
 *
 * FR-EVENT-001: Event creation fields.
 * FR-EVENT-003: QR code regeneration.
 * FR-EVENT-004: Gallery access mode.
 */

const { z } = require('zod');
const { GALLERY_ACCESS_MODE, EVENT_STATUS } = require('@photofolio/shared');

const accessModeValues = Object.values(GALLERY_ACCESS_MODE);
const editableStatusValues = [EVENT_STATUS.DRAFT, EVENT_STATUS.ACTIVE, EVENT_STATUS.CLOSED];

/** FR-EVENT-001: Create event */
const createEventSchema = z.object({
  name: z
    .string({ required_error: 'Event name is required' })
    .trim()
    .min(1, 'Event name is required')
    .max(300, 'Event name cannot exceed 300 characters'),
  dateStart: z
    .string({ required_error: 'Event start date is required' })
    .datetime({ message: 'Start date must be a valid ISO 8601 datetime' }),
  dateEnd: z
    .string()
    .datetime({ message: 'End date must be a valid ISO 8601 datetime' })
    .nullable()
    .optional(),
  venue: z
    .string()
    .trim()
    .max(500, 'Venue cannot exceed 500 characters')
    .optional(),
  coverImage: z
    .string()
    .max(1000)
    .nullable()
    .optional(),
  accessMode: z
    .enum(accessModeValues, {
      errorMap: () => ({
        message: `Access mode must be one of: ${accessModeValues.join(', ')}`,
      }),
    })
    .default(GALLERY_ACCESS_MODE.LINK_ONLY),
  status: z
    .enum(editableStatusValues, {
      errorMap: () => ({
        message: `Status must be one of: ${editableStatusValues.join(', ')}`,
      }),
    })
    .optional(),
});

/** FR-EVENT-001/004: Update event */
const updateEventSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Event name cannot be empty')
    .max(300, 'Event name cannot exceed 300 characters')
    .optional(),
  dateStart: z
    .string()
    .datetime({ message: 'Start date must be a valid ISO 8601 datetime' })
    .optional(),
  dateEnd: z
    .string()
    .datetime({ message: 'End date must be a valid ISO 8601 datetime' })
    .nullable()
    .optional(),
  venue: z
    .string()
    .trim()
    .max(500, 'Venue cannot exceed 500 characters')
    .optional(),
  coverImage: z
    .string()
    .max(1000)
    .nullable()
    .optional(),
  accessMode: z
    .enum(accessModeValues, {
      errorMap: () => ({
        message: `Access mode must be one of: ${accessModeValues.join(', ')}`,
      }),
    })
    .optional(),
  status: z
    .enum(editableStatusValues, {
      errorMap: () => ({
        message: `Status must be one of: ${editableStatusValues.join(', ')}`,
      }),
    })
    .optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update.' }
);

/** FR-EVENT-003: Regenerate QR code */
const regenerateQrSchema = z.object({
  qrType: z.enum(['A', 'B'], {
    errorMap: () => ({ message: 'qrType must be "A" (gallery) or "B" (find-my-photos).' }),
  }),
});

/** List events query params */
const listEventsQuerySchema = z.object({
  status: z
    .enum(Object.values(EVENT_STATUS))
    .optional(),
  page: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1))
    .optional()
    .default('1'),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .default('20'),
});

module.exports = {
  createEventSchema,
  updateEventSchema,
  regenerateQrSchema,
  listEventsQuerySchema,
};
