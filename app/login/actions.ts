"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findPerson } from "@/agent/lib/data";
import { SESSION_COOKIE, signSession } from "@/agent/lib/session";

// Demo sign-in: pick a person, enter the shared demo password. Good enough to
// show role-based access in an assessment; production would use the company
// IdP (or Vercel Passport) and map the IdP group to the IC/manager role.
export async function signIn(formData: FormData) {
  const personId = String(formData.get("personId") ?? "");
  const password = String(formData.get("password") ?? "");
  const expected = process.env.DEMO_PASSWORD ?? "PasswordVercel";

  if (password !== expected) redirect("/login?error=password");
  const person = await findPerson(personId);
  if (!person || person.id !== personId) redirect("/login?error=person");

  const token = await signSession({ personId: person.id, name: person.name, role: person.role });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect("/");
}

export async function signOut() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
