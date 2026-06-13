import { ImageResponse } from "next/og";
import type { EventRecord } from "@/lib/events";
import { formatLongDate } from "@/lib/format";

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const OG_IMAGE_CONTENT_TYPE = "image/png";

type OgEventData = Pick<
  EventRecord,
  "eventTitle" | "artistName" | "venueName" | "eventDate" | "eventTime" | "imageUrl" | "tags"
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
  const displayTags = event.tags.slice(0, 3);

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
            width: "400px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 10px 40px 40px",
            flexShrink: 0,
          }}
        >
          {event.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- Satori ImageResponse requires raw img; alt is not rendered in OG images
            <img
              src={event.imageUrl}
              alt={event.eventTitle}
              width={340}
              height={340}
              style={{
                borderRadius: "8px",
                objectFit: "cover",
                border: "1px solid rgba(255, 255, 255, 0.16)",
              }}
            />
          ) : (
            <div
              style={{
                width: "340px",
                height: "340px",
                borderRadius: "8px",
                background:
                  "linear-gradient(135deg, rgba(8, 127, 140, 0.88), rgba(17, 32, 28, 0.92))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "48px",
                fontWeight: 900,
                textTransform: "uppercase" as const,
                letterSpacing: "0.08em",
                border: "1px solid rgba(255, 255, 255, 0.16)",
                textAlign: "center" as const,
                padding: "24px",
                lineHeight: 1.1,
              }}
            >
              {event.eventTitle.length > 30
                ? event.eventTitle.slice(0, 27) + "…"
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
            justifyContent: "center",
            padding: "40px 40px 40px 24px",
            gap: "2px",
            minWidth: 0,
          }}
        >
          {/* Venue — eyebrow style: teal, extreme uppercase tracking */}
          <div
            style={{
              display: "flex",
              fontSize: "13px",
              fontWeight: 800,
              color: "#087f8c",
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              marginBottom: "10px",
            }}
          >
            {event.venueName}
          </div>

          {/* Event title — heavy weight, tight tracking */}
          <div
            style={{
              display: "flex",
              fontSize: event.eventTitle.length > 50 ? "34px" : "42px",
              fontWeight: 900,
              lineHeight: 1.0,
              letterSpacing: "-0.02em",
              marginBottom: "10px",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {event.eventTitle.length > 80
              ? event.eventTitle.slice(0, 77) + "…"
              : event.eventTitle}
          </div>

          {/* Artist name (if different from title) — muted zinc */}
          {event.artistName !== event.eventTitle && (
            <div
              style={{
                display: "flex",
                fontSize: "20px",
                fontWeight: 400,
                color: "#a1a1aa",
                marginBottom: "16px",
              }}
            >
              {event.artistName}
            </div>
          )}

          {/* Date & Time — metadata style: uppercase, wide tracking */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              marginTop: "4px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "10px",
                fontWeight: 900,
                color: "#71717a",
                textTransform: "uppercase" as const,
                letterSpacing: "0.16em",
              }}
            >
              DATE
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "18px",
                fontWeight: 400,
                color: "#fafafa",
                marginBottom: "10px",
              }}
            >
              {formattedDate}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "10px",
                fontWeight: 900,
                color: "#71717a",
                textTransform: "uppercase" as const,
                letterSpacing: "0.16em",
              }}
            >
              TIME
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "18px",
                fontWeight: 400,
                color: "#fafafa",
              }}
            >
              {time}
            </div>
          </div>

          {/* Tags — pill-shaped badges */}
          {displayTags.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                marginTop: "18px",
              }}
            >
              {displayTags.map((tag) => (
                <div
                  key={tag}
                  style={{
                    display: "flex",
                    padding: "4px 12px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase" as const,
                    background: "rgba(8, 127, 140, 0.15)",
                    border: "1px solid rgba(8, 127, 140, 0.3)",
                    color: "#5eead4",
                  }}
                >
                  {tag}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom branding — editorial feel */}
        <div
          style={{
            position: "absolute",
            bottom: "18px",
            right: "40px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "13px",
            fontWeight: 800,
            color: "#52525b",
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
          }}
        >
          AVLmc
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
