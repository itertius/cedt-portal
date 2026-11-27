"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createNote, deleteNote, parseNoteForm, updateNote } from "@/lib/notes/notes";

async function userId() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user.id;
}

/** New empty note (optionally linked), then open it. */
export async function createNoteAction(form: FormData) {
  const uid = await userId();
  const str = (k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string) : "");
  const id = await createNote(uid, {
    title: str("title").trim().slice(0, 200),
    courseId: str("courseId") || null,
    eventId: str("eventId") || null,
  });
  revalidatePath("/notes");
  redirect(`/notes/${id}`);
}

export interface SaveNoteState {
  savedAt?: string;
  error?: string;
}

/** Save from the form (works without JavaScript) and from autosave. */
export async function saveNoteAction(_prev: SaveNoteState, form: FormData): Promise<SaveNoteState> {
  const uid = await userId();
  const id = form.get("id");
  if (typeof id !== "string") return { error: "Missing note id" };
  const parsed = parseNoteForm(form);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid note" };
  const updatedAt = await updateNote(uid, id, parsed.data);
  if (!updatedAt) return { error: "This note no longer exists." };
  revalidatePath("/notes");
  return { savedAt: updatedAt.toISOString() };
}

export async function deleteNoteAction(form: FormData) {
  const uid = await userId();
  const id = form.get("id");
  if (typeof id === "string") await deleteNote(uid, id);
  revalidatePath("/notes");
  redirect("/notes");
}
