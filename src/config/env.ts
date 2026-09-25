import { z } from "zod";

// createClient appends its own /rest/v1 endpoint to the project base URL.
export const supabaseProjectUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.pathname === "/" && !url.search && !url.hash;
});

const publicSupabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: supabaseProjectUrlSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export function formatEnvError(error: z.ZodError): Error {
  const variables = error.issues
    .map((issue) => issue.path.join("."))
    .join(", ");
  return new Error(
    `Invalid or missing Supabase environment variables: ${variables}`,
  );
}

export function getPublicSupabaseEnv() {
  const result = publicSupabaseEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!result.success) {
    throw formatEnvError(result.error);
  }

  return result.data;
}
