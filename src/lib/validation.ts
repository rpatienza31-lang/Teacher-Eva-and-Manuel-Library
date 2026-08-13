import { z } from "zod";

/**
 * Upload validation (SPEC §10): allowed types + size caps. Enforced
 * server-side when issuing the presigned PUT and when recording the file row.
 */
export const FILE_TYPES = ["docx", "pdf", "pptx", "image"] as const;
export type FileType = (typeof FILE_TYPES)[number];

// Map allowed content types -> our coarse fileType tag.
export const ALLOWED_CONTENT_TYPES: Record<string, FileType> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
};

export const MAX_FILE_BYTES = 1024 * 1024 * 500; // 500 MB cap per file

export const SUBJECTS = [
  "Mathematics",
  "English",
  "Science",
  "Filipino",
  "Araling Panlipunan",
  "MAPEH",
  "Values Education",
  "TLE",
] as const;

export const emailSchema = z.string().email().transform((s) => s.toLowerCase().trim());
export const weekSchema = z.coerce.number().int().min(1).max(10);
export const termSchema = z.coerce.number().int().min(1).max(4);
export const gradeSchema = z.coerce.number().int().min(1).max(12);

export const grantSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().max(200).optional(),
  productIds: z.array(z.string().uuid()).min(1),
  orderRef: z.string().trim().max(120).optional(),
});

export const revokeSchema = z.object({
  userId: z.string().uuid(),
  productId: z.string().uuid(),
});

export const createProductSchema = z.object({
  term: termSchema,
  grade: gradeSchema,
  subject: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  code: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[A-Za-z0-9\-_]+$/, "code may contain only letters, digits, - and _"),
});

export const presignUploadSchema = z.object({
  productId: z.string().uuid(),
  weekNumber: weekSchema,
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().refine((t) => t in ALLOWED_CONTENT_TYPES, {
    message: "unsupported file type",
  }),
  sizeBytes: z.coerce.number().int().positive().max(MAX_FILE_BYTES),
});

export const recordFileSchema = z.object({
  productId: z.string().uuid(),
  weekNumber: weekSchema,
  storageKey: z.string().min(1),
  displayName: z.string().trim().min(1).max(200),
  fileType: z.enum(FILE_TYPES),
  sizeBytes: z.coerce.number().int().nonnegative(),
});

export const publishWeekSchema = z.object({
  productId: z.string().uuid(),
  weekNumber: weekSchema,
});
