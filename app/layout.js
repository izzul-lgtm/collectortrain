import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata = {
  title: "CollectorTrain — Debt Collection Training System",
  description: "Voice-based debt collection training simulator",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ms">
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
