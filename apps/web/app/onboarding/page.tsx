import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { collections } from "@dailyscribe/core";
import { auth } from "@/auth";
import { ONBOARDING_SERVICES } from "@/lib/service-catalog";
import { OnboardingFlow } from "./onboarding-flow";

export const runtime = "nodejs";

export default async function OnboardingPage() {
  const session = await auth();
  // Unauthenticated users get the sign-in card that /dashboard already renders.
  if (!session?.user?.id) redirect("/dashboard");

  const userId = session.user.id;
  const { users, subscriptions } = await collections();
  const [user, subCount] = await Promise.all([
    ObjectId.isValid(userId) ? users.findOne({ _id: new ObjectId(userId) }) : null,
    subscriptions.countDocuments({ userId }),
  ]);

  // Already set up (finished onboarding, or configured services some other way).
  if (user?.onboardedAt || subCount > 0) redirect("/dashboard");

  return (
    <main className="onboarding">
      <header className="topbar">
        <h1>
          <a className="heading-link" href="https://dailyscribe.ca/">
            Daily Scribe
          </a>
        </h1>
      </header>
      <OnboardingFlow email={session.user.email ?? ""} services={ONBOARDING_SERVICES} />
    </main>
  );
}
