import { commitSha, deployEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function Home() {
  const env = deployEnv();
  return (
    <main className="shell">
      <h1>CEDT Hub</h1>
      <p>
        One login for MyCourseVille, Grader, Talent Journey, Intern Portal, Nisitez and ICES. Coming
        soon.
      </p>
      <p className="meta">
        {env} · {commitSha()}
      </p>
    </main>
  );
}
