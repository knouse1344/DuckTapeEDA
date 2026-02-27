import type { CircuitDesign, ChatMessage } from "../types/circuit";

export interface DesignSummary {
  id: number;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
}

export interface SavedDesign {
  id: number;
  name: string;
  description: string;
  design: CircuitDesign;
  messages: ChatMessage[];
  created_at: number;
  updated_at: number;
}

async function apiFetch(token: string, path: string, options?: RequestInit) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string })?.error || `API error: ${res.status}`);
  }
  return res.json();
}

export async function saveDesign(
  token: string,
  design: CircuitDesign,
  messages: ChatMessage[]
): Promise<number> {
  const data = await apiFetch(token, "/api/designs", {
    method: "POST",
    body: JSON.stringify({
      name: design.name,
      description: design.description || "",
      designJson: JSON.stringify(design),
      chatJson: JSON.stringify(messages.map((m) => ({ role: m.role, content: m.content }))),
    }),
  });
  return (data as { id: number }).id;
}

export async function updateDesign(
  token: string,
  id: number,
  design: CircuitDesign,
  messages: ChatMessage[]
): Promise<void> {
  await apiFetch(token, `/api/designs/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: design.name,
      description: design.description || "",
      designJson: JSON.stringify(design),
      chatJson: JSON.stringify(messages.map((m) => ({ role: m.role, content: m.content }))),
    }),
  });
}

export async function listDesigns(token: string): Promise<DesignSummary[]> {
  const data = await apiFetch(token, "/api/designs");
  return (data as { designs: DesignSummary[] }).designs;
}

export async function getDesign(token: string, id: number): Promise<SavedDesign> {
  const data = await apiFetch(token, `/api/designs/${id}`);
  const raw = (data as { design: { id: number; name: string; description: string; design_json: string; chat_json: string; created_at: number; updated_at: number } }).design;
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    design: JSON.parse(raw.design_json) as CircuitDesign,
    messages: JSON.parse(raw.chat_json) as ChatMessage[],
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export async function deleteDesign(token: string, id: number): Promise<void> {
  await apiFetch(token, `/api/designs/${id}`, { method: "DELETE" });
}
