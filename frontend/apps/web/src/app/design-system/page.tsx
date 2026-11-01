import { notFound } from "next/navigation";
import { DesignSystemShowcase } from "./showcase";

export const metadata = {
  title: "Design System Showcase • Academic Suite",
  description: "Dev-only interactive showcase for preset b2BnwmRcY",
};

export default function DesignSystemPage() {
  // Excluded / strictly guarded in production environments
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <DesignSystemShowcase />;
}
