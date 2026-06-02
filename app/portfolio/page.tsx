import dynamic from "next/dynamic";

const PortfolioClient = dynamic(() => import("@/components/PortfolioClient"));

export default function PortfolioPage() {
  return <PortfolioClient />;
}
