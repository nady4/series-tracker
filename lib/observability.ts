type EventFields = Record<string, string | number | boolean | null | undefined>;

export function logEvent(event: string, fields: EventFields = {}) {
  console.info(
    JSON.stringify({
      service: "series-tracker",
      event,
      timestamp: new Date().toISOString(),
      ...fields,
    }),
  );
}
