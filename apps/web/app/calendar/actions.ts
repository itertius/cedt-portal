"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createEvent, deleteEvent, parseEventForm, updateEvent } from "@/lib/calendar/events";
import { dateKeyOf } from "@/lib/calendar/time";

export interface EventFormState {
  errors?: Record<string, string>;
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const i of issues) {
    const key = String(i.path[0] ?? "form");
    errors[key] ??= i.message;
  }
  return errors;
}

export async function saveEventAction(
  _prev: EventFormState,
  form: FormData,
): Promise<EventFormState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const parsed = parseEventForm(form);
  if (!parsed.success) return { errors: fieldErrors(parsed.error.issues) };

  const id = form.get("id");
  if (typeof id === "string" && id) {
    const ok = await updateEvent(session.user.id, id, parsed.data);
    if (!ok) return { errors: { form: "This event no longer exists." } };
  } else {
    await createEvent(session.user.id, parsed.data);
  }
  revalidatePath("/calendar");
  redirect(`/calendar?date=${dateKeyOf(parsed.data.startsAt)}`);
}

export async function deleteEventAction(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const id = form.get("id");
  const date = form.get("date");
  if (typeof id === "string") await deleteEvent(session.user.id, id);
  revalidatePath("/calendar");
  redirect(typeof date === "string" && date ? `/calendar?date=${date}` : "/calendar");
}
