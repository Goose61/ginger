import Image from "next/image";
import Link from "next/link";

const Logo: React.FC = () => {
  return (
    <Link href="/" className="inline-flex items-center text-white">
      <Image
        src="/images/ginger.jpg"
        alt="Ginger NFT marketplace"
        width={1254}
        height={1254}
        priority
        className="h-10 w-10 rounded-md object-contain sm:h-11 sm:w-11"
      />
    </Link>
  );
};

export default Logo;
