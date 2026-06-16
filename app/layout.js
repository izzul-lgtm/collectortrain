import "./globals.css";

export const metadata = {
  title: "CollectorTrain — Debt Collection Training System",
  description: "Voice-based debt collection training simulator",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ms">
      <body>{children}</body>
    </html>
  );
}
