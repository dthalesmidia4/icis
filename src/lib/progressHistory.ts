import { supabase } from "@/integrations/supabase/client";

interface ProgressEvent {
  tenantId: string;
  employeeId: string;
  eventType: string;
  eventTitle: string;
  eventData?: Record<string, any>;
  createdBy?: string;
}

export async function logProgressEvent({
  tenantId,
  employeeId,
  eventType,
  eventTitle,
  eventData = {},
  createdBy,
}: ProgressEvent) {
  try {
    const { error } = await supabase
      .from("employee_progress_history" as any)
      .insert({
        tenant_id: tenantId,
        employee_id: employeeId,
        event_type: eventType,
        event_title: eventTitle,
        event_data: eventData,
        created_by: createdBy || null,
      } as any);

    if (error) {
      console.error("Erro ao registrar histórico:", error);
    }
  } catch (err) {
    console.error("Erro ao registrar histórico:", err);
  }
}
