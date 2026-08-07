import Link from "next/link";
import { BrandMark } from "./brand-mark";

type BrandProps = {
  href?: string;
};

function BrandContent() {
  return (
    <>
      <span className="brand-mark" aria-hidden="true">
        <BrandMark />
      </span>
      <span className="brand-name">
        Series<em>Tracker</em>
      </span>
    </>
  );
}

export function Brand({ href }: BrandProps) {
  if (href) {
    return (
      <Link href={href} className="brand" aria-label="Series Tracker home">
        <BrandContent />
      </Link>
    );
  }

  return (
    <span className="brand">
      <BrandContent />
    </span>
  );
}
