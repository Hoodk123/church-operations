import { z } from "zod";
import { categorySchema } from "./people.js";

export const templatePurposeSchema = z.enum([
  "follow_up",
  "m1_reminder",
  "m1_catch_up",
  "m1_materials",
  "m1_certificate",
  "baptism_reminder",
]);

export const templateListQuerySchema = z.object({
  purpose: templatePurposeSchema.optional(),
  active: z
    .union([
      z.boolean(),
      z.enum(["true", "false"]).transform((value) => value === "true"),
    ])
    .optional(),
});

export const templateCreateSchema = z.object({
  name: z.string().min(1).max(120).transform((value) => value.trim()),
  body: z.string().min(1).max(3000).transform((value) => value.trim()),
  purpose: templatePurposeSchema.default("follow_up"),
  suggestedCategory: categorySchema.nullish(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

export const templateUpdateSchema = z.object({
  name: z.string().min(1).max(120).transform((value) => value.trim()).optional(),
  body: z.string().min(1).max(3000).transform((value) => value.trim()).optional(),
  purpose: templatePurposeSchema.optional(),
  suggestedCategory: categorySchema.nullish().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});

export const templateReorderSchema = z.object({
  items: z
    .array(z.object({ id: z.uuid(), sortOrder: z.number().int().min(0).max(9999) }))
    .min(1)
    .max(100),
});

export const templateApiSchema = z.object({
  id: z.string(),
  name: z.string(),
  body: z.string(),
  purpose: templatePurposeSchema,
  suggestedCategory: categorySchema.nullable(),
  sortOrder: z.number().int(),
  active: z.boolean(),
});

export const templateListApiSchema = z.object({
  items: z.array(templateApiSchema),
});

export const templateReorderResultSchema = z.object({
  updated: z.number().int(),
});

export type TemplatePurpose = z.output<typeof templatePurposeSchema>;
export type TemplateApi = z.output<typeof templateApiSchema>;
export type TemplateListQuery = z.input<typeof templateListQuerySchema>;
export type TemplateCreateInput = z.input<typeof templateCreateSchema>;
export type TemplateUpdateInput = z.input<typeof templateUpdateSchema>;
