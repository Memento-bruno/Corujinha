import type { UserProfile } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export function Avatar({ user, size = 36, className, image }: { user: UserProfile; size?: number; className?: string; image?: string | null }) {
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl font-bold text-white ring-2 ring-white", className)}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${user.avatarColor}, ${user.avatarColor}aa)`, fontSize: size * 0.36 }}
      title={user.name}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={user.name} className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials
      )}
    </span>
  );
}
