import "./styles.css";

export const metadata = {
  title: "Suraj Job Agent",
  description: "AI-assisted job application dashboard"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ colorScheme: "dark", backgroundColor: "#09090b" }}>
      <body style={{ minHeight: "100vh", margin: 0, backgroundColor: "#09090b", color: "#e4e4e7" }}>{children}</body>
    </html>
  );
}
