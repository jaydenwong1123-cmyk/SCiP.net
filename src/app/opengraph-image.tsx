import { ImageResponse } from "next/og";

// The preview card shown when a link to the site is pasted into Discord or any
// other app that unfurls links. Static: no session, no database.
//
// Reachable without a session; see the "/opengraph-image" entry in proxy.ts.
// Without that, the service fetching the image would be redirected to /login.
export const alt = "SCiP.net: SCP Foundation roleplay member terminal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#050705",
          color: "#33ff66",
          padding: 64,
          border: "6px solid #33ff66",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, color: "#ffcc55", letterSpacing: 6 }}>
          TOP SECRET // SCiP-NULL // AUTHORIZED PERSONNEL ONLY
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 150, color: "#aaffc4", letterSpacing: 8 }}>
            SCiP.net
          </div>
          <div style={{ display: "flex", fontSize: 48, letterSpacing: 10 }}>
            SECURE. CONTAIN. PROTECT.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#ffcc55" }}>
          SCP Foundation roleplay terminal · invite only · join via Discord
        </div>
      </div>
    ),
    size
  );
}
