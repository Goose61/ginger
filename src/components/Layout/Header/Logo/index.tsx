import Image from "next/image";
import Link from "next/link";

const Logo: React.FC = () => {
  return (
    <Link href="/" className="inline-flex min-w-0 items-center gap-2.5 text-white">
      <Image
        src="/images/ginger.jpg"
        alt=""
        width={1254}
        height={1254}
        priority
        aria-hidden
        className="h-10 w-10 shrink-0 rounded-md object-contain sm:h-11 sm:w-11"
      />
      <span className="flex min-w-0 flex-col leading-none">
        <span className="truncate font-bold text-base tracking-tight sm:text-[1.1rem]">
          Ginger
        </span>
        <span className="hidden font-[family-name:var(--font-body)] text-[11px] tracking-[0.08em] text-white/50 sm:block">
          NFT marketplace
        </span>
      </span>
    </Link>
  );
};

export default Logo;
