import { redirect } from "next/navigation";
import { SPOTIFY_LIMITED_BETA_CODE } from "@/lib/spotify-limited-access";

export default function AuthErrorPage() {
  redirect(`/?spotify=${SPOTIFY_LIMITED_BETA_CODE}#personalized-discovery`);
}
