import { ImageResponse } from "next/og";
import type { EventRecord } from "@/lib/events";
import { formatLongDate } from "@/lib/format";

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const OG_IMAGE_CONTENT_TYPE = "image/png";

type OgEventData = Pick<
  EventRecord,
  "eventTitle" | "artistName" | "venueName" | "eventDate" | "eventTime" | "imageUrl" | "tags" | "source"
>;

export async function renderOgImage(event: OgEventData) {
  const interBold = await fetch(
    "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZhrib2Bg-4.ttf"
  ).then((res) => res.arrayBuffer());

  const interRegular = await fetch(
    "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf"
  ).then((res) => res.arrayBuffer());

  const interBlack = await fetch(
    "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuDyYMZhrib2Bg-4.ttf"
  ).then((res) => res.arrayBuffer());

  const formattedDate = formatLongDate(event.eventDate);
  const time = event.eventTime ?? "Time TBA";


  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#0A0A0A",
          fontFamily: "Inter, sans-serif",
          color: "#ffffff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Ambient teal/gold glow — matches the app radial gradients */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "radial-gradient(ellipse at 15% 0%, rgba(8, 127, 140, 0.26) 0%, transparent 50%), radial-gradient(ellipse at 85% 100%, rgba(240, 169, 58, 0.09) 0%, transparent 40%)",
            display: "flex",
          }}
        />

        {/* Show image section */}
        <div
          style={{
            width: "500px",
            height: "100%",
            display: "flex",
            alignItems: "stretch",
            justifyContent: "stretch",
            flexShrink: 0,
            borderRight: "1px solid rgba(255, 255, 255, 0.16)",
          }}
        >
          {event.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- Satori ImageResponse requires raw img; alt is not rendered in OG images
            <img
              src={event.imageUrl}
              alt={event.eventTitle}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background:
                  "linear-gradient(135deg, rgba(8, 127, 140, 0.88), rgba(17, 32, 28, 0.92))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "64px",
                fontWeight: 900,
                textTransform: "uppercase" as const,
                letterSpacing: "0.08em",
                textAlign: "center" as const,
                padding: "32px",
                lineHeight: 1.1,
              }}
            >
              {event.eventTitle.length > 40
                ? event.eventTitle.slice(0, 37) + "…"
                : event.eventTitle}
            </div>
          )}
        </div>

        {/* Text content section */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: "40px 40px",
            minWidth: 0,
          }}
        >
          {/* Top portion: Venue and Title */}
          <div style={{ display: "flex", flexDirection: "column", marginBottom: "auto" }}>
            <div
              style={{
                display: "flex",
                fontSize: "18px",
                fontWeight: 900,
                color: "#087f8c",
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em",
                marginBottom: "12px",
              }}
            >
              {event.venueName}
            </div>

            <div
              style={{
                display: "flex",
                fontSize: event.eventTitle.length > 50 ? "40px" : "48px",
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                marginBottom: "16px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: "#ffffff",
              }}
            >
              {event.eventTitle.length > 80
                ? event.eventTitle.slice(0, 77) + "…"
                : event.eventTitle}
            </div>
          </div>

          {/* Bottom portion: 2x2 grid + Branding */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
            {/* Row 1: Date & Time */}
            <div style={{ display: "flex", gap: "12px", width: "100%" }}>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "8px", padding: "16px" }}>
                <div style={{ fontSize: "12px", fontWeight: 900, color: "#087f8c", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: "8px" }}>
                  DATE
                </div>
                <div style={{ fontSize: "16px", fontWeight: 400, color: "#fafafa" }}>
                  {formattedDate}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "8px", padding: "16px" }}>
                <div style={{ fontSize: "12px", fontWeight: 900, color: "#087f8c", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: "8px" }}>
                  TIME
                </div>
                <div style={{ fontSize: "16px", fontWeight: 400, color: "#fafafa" }}>
                  {time}
                </div>
              </div>
            </div>

            {/* Row 2: Artist & Source */}
            <div style={{ display: "flex", gap: "12px", width: "100%" }}>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "8px", padding: "16px" }}>
                <div style={{ fontSize: "12px", fontWeight: 900, color: "#087f8c", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: "8px" }}>
                  ARTIST
                </div>
                <div style={{ fontSize: "16px", fontWeight: 400, color: "#fafafa" }}>
                  {event.artistName.length > 30 ? event.artistName.slice(0, 27) + "…" : event.artistName}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "8px", padding: "16px" }}>
                <div style={{ fontSize: "12px", fontWeight: 900, color: "#087f8c", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: "8px" }}>
                  SOURCE
                </div>
                <div style={{ fontSize: "16px", fontWeight: 400, color: "#fafafa" }}>
                  {event.source.length > 30 ? event.source.slice(0, 27) + "…" : event.source}
                </div>
              </div>
            </div>

            {/* Branding replacing the button */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, rgba(8, 127, 140, 0.15) 0%, rgba(8, 127, 140, 0.05) 100%)",
                border: "1px solid rgba(8, 127, 140, 0.3)",
                borderRadius: "999px",
                padding: "16px",
                marginTop: "4px",
                width: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "#087f8c",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  fontWeight: 900,
                  marginRight: "14px",
                  color: "white",
                  fontSize: "20px",
                }}
              >
                AVLmc
              </div>
              <div style={{ display: "flex", fontSize: "20px", fontWeight: 800, color: "#ffffff", letterSpacing: "0.02em" }}>
                Asheville Music Companion
              </div>
            </div>
          </div>
        </div>

        {/* Top-right teal accent line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "200px",
            height: "3px",
            background: "linear-gradient(90deg, transparent, #087f8c)",
            display: "flex",
          }}
        />
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
      fonts: [
        {
          name: "Inter",
          data: interRegular,
          style: "normal",
          weight: 400,
        },
        {
          name: "Inter",
          data: interBold,
          style: "normal",
          weight: 700,
        },
        {
          name: "Inter",
          data: interBlack,
          style: "normal",
          weight: 900,
        },
      ],
    }
  );
}
