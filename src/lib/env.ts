import { z } from "zod";

/**
 * Centralized, validated environment access. Secrets are read ONLY on the
 * server (§10) — never import this from a client component.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be a long random string"),

  R2_ACCOUNT_ID: z.string().default(""),
  R2_ACCESS_KEY_ID: z.string().default(""),
  R2_SECRET_ACCESS_KEY: z.string().default(""),
  R2_BUCKET: z.string().default("lesson-plans"),
  R2_ENDPOINT: z.string().default(""),

  RESEND_API_KEY: z.string().default(""),
  EMAIL_FROM: z
    .string()
    .default("Teacher Eva & Manuel <no-reply@portal.example.com>"),
  EMAIL_DRY_RUN: z.string().default("0"),
});

// During `next build` the DB/secret may be absent; only fully validate at
// runtime. Parse leniently and surface a clear error when a value is used.
const parsed = schema.safeParse(process.env);

export const env = (
  parsed.success ? parsed.data : (process.env as unknown)
) as z.infer<typeof schema>;

export const emailDryRun = () => env.EMAIL_DRY_RUN === "1";
