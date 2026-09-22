import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "码上答 · Java 面试 RAG 练习台",
  description: "上传 Java 技术资料，基于检索内容生成面试题并获得作答反馈。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
