/**
 * Pure shared types/constants for the partner/resource directory (PRD 08 / C3).
 *
 * No `server-only` import, so both the server CRUD layer (`lib/admin/resources.ts`) and the client
 * Stewardship UI can use these without duplicating the allowlists.
 */

export const RESOURCE_TYPES = [
  "source",
  "playlist",
  "venue_partner",
  "community_org",
  "press_media",
  "playlist_collaborator",
  "sponsor",
  "venue_contact",
  "artist_resource",
  "other",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const RESOURCE_STATUSES = ["active", "prospect", "archived"] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  source: "Data source",
  playlist: "Playlist",
  venue_partner: "Venue partner",
  community_org: "Community org",
  press_media: "Press / media",
  playlist_collaborator: "Playlist collaborator",
  sponsor: "Sponsor",
  venue_contact: "Venue contact",
  artist_resource: "Artist / community resource",
  other: "Other",
};

export type AdminResource = {
  id: string;
  type: ResourceType;
  name: string;
  description: string | null;
  url: string | null;
  status: ResourceStatus;
  linkedVenueName: string | null;
  linkedSource: string | null;
  surfacedPublicly: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResourceWriteInput = {
  type: ResourceType;
  name: string;
  description?: string | null;
  url?: string | null;
  status?: ResourceStatus;
  linkedVenueName?: string | null;
  linkedSource?: string | null;
  surfacedPublicly?: boolean;
  notes?: string | null;
};
