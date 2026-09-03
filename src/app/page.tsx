import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/server/auth/session";

export default async function Home() {
  const auth = await getCurrentAuth();
  redirect(auth ? "/app/dashboard" : "/login");
}
