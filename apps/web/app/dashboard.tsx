import { PLATFORMS } from "@cedt-hub/connectors";
import { TALENT_HOME } from "@cedt-hub/connectors/talent";
import type { getDashboard } from "@/lib/dashboard";
import { formatDue, relative } from "@/lib/format";
import { SyncButton, TaskCheckbox } from "./dashboard-client";

type Data = Awaited<ReturnType<typeof getDashboard>>;
type Task = Data["upcoming"][number];

function TaskRow({ t, now }: { t: Task; now: Date }) {
  const done = t.completedAt !== null;
  return (
    <li className={done ? "task done" : "task"}>
      <TaskCheckbox id={t.id} done={done} title={t.title} />
      <span className="tag">{t.source.toUpperCase()}</span>
      <span className="task-title">
        {t.url ? (
          <a href={t.url} target="_blank" rel="noreferrer">
            {t.title}
          </a>
        ) : (
          t.title
        )}
        {t.courseCode ? <span className="muted"> · {t.courseCode}</span> : null}
      </span>
      {t.dueAt ? (
        <span className="due" title={t.dueAt.toISOString()}>
          {formatDue(t.dueAt)} <span className="muted">({relative(t.dueAt, now)})</span>
        </span>
      ) : null}
    </li>
  );
}

function TaskList({
  title,
  tasks,
  now,
  empty,
}: {
  title: string;
  tasks: Task[];
  now: Date;
  empty?: string;
}) {
  if (tasks.length === 0 && !empty) return null;
  return (
    <section className="card">
      <h2>
        {title} <span className="muted">{tasks.length}</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="tasks">
          {tasks.map((t) => (
            <TaskRow key={t.id} t={t} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function Dashboard({ name, data }: { name: string; data: Data }) {
  const now = new Date();
  const { sync } = data;
  return (
    <div className="dashboard">
      <header className="dash-header">
        <h1>Hi, {name}</h1>
        <p className="muted">
          {sync?.lastSyncedAt
            ? `MyCourseVille synced ${relative(sync.lastSyncedAt, now)}`
            : sync?.status === "running"
              ? "Syncing MyCourseVille for the first time…"
              : "MyCourseVille not synced yet"}
          {sync?.status === "error" && sync.lastError ? (
            <span className="error"> · {sync.lastError}</span>
          ) : null}{" "}
          <SyncButton />
        </p>
      </header>

      <TaskList title="Overdue" tasks={data.overdue} now={now} />
      <TaskList
        title="Due soon"
        tasks={data.upcoming}
        now={now}
        empty="Nothing due. Enjoy the free time."
      />
      <TaskList title="No deadline" tasks={data.undated} now={now} />
      <TaskList title="Done this week" tasks={data.done} now={now} />

      <section className="card">
        <h2>
          Courses
          {data.term ? (
            <span className="muted">
              {" "}
              {data.term.year} / {data.term.semester}
            </span>
          ) : null}
        </h2>
        {data.courses.length === 0 ? (
          <p className="muted">No courses yet.</p>
        ) : (
          <ul className="courses">
            {data.courses.map((c) => (
              <li key={c.id}>
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer">
                    {c.code ? <strong>{c.code}</strong> : null} {c.title}
                  </a>
                ) : (
                  c.title
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>
          CEDT activities <span className="muted">from Talent Journey</span>
        </h2>
        {data.activities.length === 0 ? (
          <p className="muted">No upcoming activities.</p>
        ) : (
          <ul className="tasks">
            {data.activities.map((a) => (
              <li key={a.activityId} className="task activity">
                <span className="tag">TALENT</span>
                <span className="task-title">
                  <a href={TALENT_HOME} target="_blank" rel="noreferrer">
                    {a.name}
                  </a>
                  {a.maxParticipants ? (
                    <span className="muted">
                      {" "}
                      · {a.participants ?? 0}/{a.maxParticipants} joined
                    </span>
                  ) : null}
                </span>
                <span className="due">{formatDue(a.startsAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Apps</h2>
        <ul className="apps">
          {PLATFORMS.map((p) => (
            <li key={p.id}>
              <a href={p.url} target="_blank" rel="noreferrer">
                <strong>{p.name}</strong> ↗
              </a>
              <span className="muted"> · {p.description}</span>
              {p.integration === "sync" ? <span className="tag">synced</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
