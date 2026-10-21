import "./styles.css";

export const metadata = {
  title: "Suraj Job Agent",
  description: "AI-assisted job application dashboard"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ colorScheme: "light", backgroundColor: "#f7f8f5" }}>
      <body style={{ minHeight: "100vh", margin: 0, backgroundColor: "#f7f8f5", color: "#1c1917" }}>{children}</body>
    </html>
  );
}
