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
          background: "linear-gradient(135deg, #0f0f14 0%, #1a1a2e 50%, #16213e 100%)",
          fontFamily: "Inter, sans-serif",
          color: "#ffffff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle background texture */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "radial-gradient(ellipse at 20% 50%, rgba(99, 102, 241, 0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(168, 85, 247, 0.06) 0%, transparent 50%)",
            display: "flex",
          }}
        />

        {/* Show image section */}
        <div
          style={{
            width: "420px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 20px 40px 40px",
            flexShrink: 0,
          }}
        >
          {event.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- Satori ImageResponse does not support next/image; alt is not rendered in OG images
            <img
              src={event.imageUrl}
              alt={event.eventTitle}
              width={360}
              height={360}
              style={{
                borderRadius: "16px",
                objectFit: "cover",
                boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            />
          ) : (
            <div
              style={{
                width: "360px",
                height: "360px",
                borderRadius: "16px",
                background:
                  "linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(168, 85, 247, 0.3) 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "80px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
              }}
            >
              🎵
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
            padding: "40px 40px 40px 20px",
            gap: "6px",
            minWidth: 0,
          }}
        >
          {/* Venue eyebrow */}
          <div
            style={{
              display: "flex",
              fontSize: "18px",
              fontWeight: 400,
              color: "rgba(167, 139, 250, 0.9)",
              textTransform: "uppercase" as const,
              letterSpacing: "2px",
              marginBottom: "4px",
            }}
          >
            {event.venueName}
          </div>

          {/* Event title */}
          <div
            style={{
              display: "flex",
              fontSize: event.eventTitle.length > 50 ? "32px" : "40px",
              fontWeight: 700,
              lineHeight: 1.15,
              marginBottom: "8px",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {event.eventTitle.length > 80
              ? event.eventTitle.slice(0, 77) + "..."
              : event.eventTitle}
          </div>

          {/* Artist name (if different from title) */}
          {event.artistName !== event.eventTitle && (
            <div
              style={{
                display: "flex",
                fontSize: "22px",
                fontWeight: 400,
                color: "rgba(255, 255, 255, 0.75)",
                marginBottom: "12px",
              }}
            >
              {event.artistName}
            </div>
          )}

          {/* Date & Time row */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              marginTop: "4px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "20px",
                color: "rgba(255, 255, 255, 0.85)",
              }}
            >
              <span style={{ fontSize: "18px" }}>📅</span>
              <span>{formattedDate}</span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "20px",
                color: "rgba(255, 255, 255, 0.85)",
              }}
            >
              <span style={{ fontSize: "18px" }}>🕐</span>
              <span>{time}</span>
            </div>
          </div>

          {/* Tags */}
          {displayTags.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginTop: "16px",
              }}
            >
              {displayTags.map((tag) => (
                <div
                  key={tag}
                  style={{
                    display: "flex",
                    padding: "4px 14px",
                    borderRadius: "20px",
                    fontSize: "14px",
                    fontWeight: 400,
                    background: "rgba(99, 102, 241, 0.2)",
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                    color: "rgba(199, 190, 255, 0.9)",
                  }}
                >
                  {tag}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom branding bar */}
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            right: "40px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "16px",
            fontWeight: 700,
            color: "rgba(255, 255, 255, 0.4)",
            letterSpacing: "1px",
          }}
        >
          avlmc
        </div>
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
      ],
    }
  );
}
