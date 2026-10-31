import {
  templateApiSchema,
  templateCreateSchema,
  templateListApiSchema,
  templateListQuerySchema,
  templatePurposeSchema,
  templateReorderResultSchema,
  templateReorderSchema,
  templateUpdateSchema,
  type TemplateApi,
  type TemplateCreateInput,
  type TemplateListQuery,
  type TemplatePurpose,
  type TemplateUpdateInput,
} from "../../../packages/shared/schemas/templates";
import { api } from "./client";

export type { TemplateApi, TemplatePurpose };

export async function listTemplates(filters: TemplateListQuery = {}): Promise<TemplateApi[]> {
  const query = templateListQuerySchema.parse(filters);
  return templateListApiSchema.parse(
    await api<unknown>("/api/templates", { query }),
  ).items;
}

export async function getTemplateByPurpose(purpose: string): Promise<Pick<TemplateApi, "name" | "body"> | null> {
  const validPurpose = templatePurposeSchema.parse(purpose);
  const templates = await listTemplates({ purpose: validPurpose });
  const template = templates[0];
  return template ? { name: template.name, body: template.body } : null;
}

export async function createTemplate(input: TemplateCreateInput): Promise<TemplateApi> {
  const body = templateCreateSchema.parse(input);
  return templateApiSchema.parse(
    await api<unknown>("/api/templates", { method: "POST", json: body }),
  );
}

export async function updateTemplate(id: string, input: TemplateUpdateInput): Promise<TemplateApi> {
  const body = templateUpdateSchema.parse(input);
  return templateApiSchema.parse(
    await api<unknown>(`/api/templates/${encodeURIComponent(id)}`, { method: "PATCH", json: body }),
  );
}

export async function reorderTemplates(items: Array<{ id: string; sortOrder: number }>): Promise<number> {
  const body = templateReorderSchema.parse({ items });
  return templateReorderResultSchema.parse(
    await api<unknown>("/api/templates/reorder", { method: "PATCH", json: body }),
  ).updated;
}

export async function deleteTemplate(id: string): Promise<void> {
  await api<undefined>(`/api/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
}
