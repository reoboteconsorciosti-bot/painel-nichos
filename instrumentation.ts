export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build" &&
      (process.env.CRM_DELIVERY_WORKER_ENABLED === "true" || (process.env.NODE_ENV === "production" && process.env.CRM_DELIVERY_WORKER_ENABLED !== "false"))) {
    const { startCrmDeliveryWorker } = await import("@/lib/crm-delivery-worker")
    startCrmDeliveryWorker()
  }
}
