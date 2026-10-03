import Image from "next/image";
import Link from "next/link";

const Logo: React.FC = () => {
  return (
    <Link
      href="/"
      className="inline-flex min-w-0 shrink-0 items-center py-0.5 sm:py-1"
      aria-label="Ginger — NFT marketplace"
    >
      <Image
        src="/images/ginger.png"
        alt="Ginger"
        width={956}
        height={950}
        priority
        className="h-11 w-auto object-contain sm:h-12"
      />
    </Link>
  );
};

export default Logo;
