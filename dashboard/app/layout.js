import "./styles.css";

export const metadata = {
  title: "Suraj Job Agent",
  description: "AI-assisted job application dashboard"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
