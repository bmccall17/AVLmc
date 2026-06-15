import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import {
  RESOURCE_STATUSES,
  RESOURCE_TYPES,
  type AdminResource,
  type ResourceStatus,
  type ResourceType,
  type ResourceWriteInput,
} from "@/lib/admin/resource-types";

/**
 * Curated partner / resource directory — server CRUD (PRD 08 / C3).
 *
 * Replaces the hard-coded placeholder partner slots with a small, persisted, admin-managed
 * directory. Reads degrade gracefully (empty list if the table is absent); writes validate
 * server-side and surface failures to the caller. All writes are reached only through the
 * admin-gated API route. Shared types/allowlists live in `lib/admin/resource-types.ts`.
 */

export type {
  AdminResource,
  ResourceStatus,
  ResourceType,
  ResourceWriteInput,
} from "@/lib/admin/resource-types";

const SELECT_COLUMNS = `
  id, type, name, description, url, status,
  linked_venue_name, linked_source, surfaced_publicly, notes,
  created_at, updated_at
`;

export async function listResources(includeArchived = true): Promise<AdminResource[]> {
  try {
    const result = await query<ResourceRow>(
      `
        select ${SELECT_COLUMNS}
        from public.admin_resources
        ${includeArchived ? "" : "where status <> 'archived'"}
        order by
          case status when 'active' then 0 when 'prospect' then 1 else 2 end,
          type,
          name
      `
    );
    return result.rows.map(mapRow);
  } catch {
    return [];
  }
}

export async function createResource(input: ResourceWriteInput): Promise<AdminResource> {
  const clean = validateWrite(input, true);
  const id = randomUUID();
  const result = await query<ResourceRow>(
    `
      insert into public.admin_resources
        (id, type, name, description, url, status, linked_venue_name, linked_source, surfaced_publicly, notes)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      returning ${SELECT_COLUMNS}
    `,
    [
      id,
      clean.type,
      clean.name,
      clean.description,
      clean.url,
      clean.status,
      clean.linkedVenueName,
      clean.linkedSource,
      clean.surfacedPublicly,
      clean.notes,
    ]
  );
  return mapRow(result.rows[0]);
}

export async function updateResource(
  id: string,
  input: ResourceWriteInput
): Promise<AdminResource | null> {
  const clean = validateWrite(input, true);
  const result = await query<ResourceRow>(
    `
      update public.admin_resources set
        type = $2, name = $3, description = $4, url = $5, status = $6,
        linked_venue_name = $7, linked_source = $8, surfaced_publicly = $9, notes = $10,
        updated_at = now()
      where id = $1
      returning ${SELECT_COLUMNS}
    `,
    [
      id,
      clean.type,
      clean.name,
      clean.description,
      clean.url,
      clean.status,
      clean.linkedVenueName,
      clean.linkedSource,
      clean.surfacedPublicly,
      clean.notes,
    ]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function setResourceStatus(
  id: string,
  status: ResourceStatus
): Promise<AdminResource | null> {
  if (!RESOURCE_STATUSES.includes(status)) {
    throw new ResourceValidationError("Invalid status.");
  }
  const result = await query<ResourceRow>(
    `
      update public.admin_resources
      set status = $2, updated_at = now()
      where id = $1
      returning ${SELECT_COLUMNS}
    `,
    [id, status]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

export class ResourceValidationError extends Error {}

type CleanResource = {
  type: ResourceType;
  name: string;
  description: string | null;
  url: string | null;
  status: ResourceStatus;
  linkedVenueName: string | null;
  linkedSource: string | null;
  surfacedPublicly: boolean;
  notes: string | null;
};

function validateWrite(input: ResourceWriteInput, requireName: boolean): CleanResource {
  if (!RESOURCE_TYPES.includes(input.type)) {
    throw new ResourceValidationError("Invalid resource type.");
  }

  const name = trimTo(input.name, 200);
  if (requireName && !name) {
    throw new ResourceValidationError("Name is required.");
  }

  const status = input.status ?? "active";
  if (!RESOURCE_STATUSES.includes(status)) {
    throw new ResourceValidationError("Invalid status.");
  }

  const url = optionalTrim(input.url, 500);
  if (url && !/^https?:\/\//i.test(url)) {
    throw new ResourceValidationError("URL must start with http:// or https://.");
  }

  return {
    type: input.type,
    name,
    description: optionalTrim(input.description, 1000),
    url,
    status,
    linkedVenueName: optionalTrim(input.linkedVenueName, 200),
    linkedSource: optionalTrim(input.linkedSource, 100),
    surfacedPublicly: Boolean(input.surfacedPublicly),
    notes: optionalTrim(input.notes, 2000),
  };
}

function trimTo(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalTrim(value: unknown, max: number): string | null {
  const trimmed = trimTo(value, max);
  return trimmed.length > 0 ? trimmed : null;
}

/* ------------------------------------------------------------------ */
/*  Row mapping                                                        */
/* ------------------------------------------------------------------ */

type ResourceRow = {
  id: string;
  type: ResourceType;
  name: string;
  description: string | null;
  url: string | null;
  status: ResourceStatus;
  linked_venue_name: string | null;
  linked_source: string | null;
  surfaced_publicly: boolean;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapRow(row: ResourceRow): AdminResource {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description,
    url: row.url,
    status: row.status,
    linkedVenueName: row.linked_venue_name,
    linkedSource: row.linked_source,
    surfacedPublicly: row.surfaced_publicly,
    notes: row.notes,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
