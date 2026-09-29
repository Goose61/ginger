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
        alt=""
        width={956}
        height={950}
        priority
        aria-hidden
        className="h-[50px] w-[50px] object-contain sm:h-[60px] sm:w-[60px]"
      />
    </Link>
  );
};

export default Logo;
