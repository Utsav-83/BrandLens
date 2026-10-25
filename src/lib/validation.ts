import { z } from "zod";

/**
 * Shared validation schema for :id route parameters.
 * Matches the Prisma model primary key format (UUID).
 */
export const idParamSchema = z
  .string()
  .uuid("Invalid ID format. Parameter must be a valid UUID.");

/**
 * Shared validation schema for the demo auth role parameter.
 */
export const demoRoleSchema = z.enum(["creator", "manager", "reviewer", "admin"], {
  errorMap: () => ({
    message: "Invalid role. Valid options are: creator, manager, reviewer, admin",
  }),
});
