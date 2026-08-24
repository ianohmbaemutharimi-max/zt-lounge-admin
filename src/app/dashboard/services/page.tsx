"use client";

import { CatalogManager } from "@/features/services/catalog-manager";

export default function ServicesPage() {
  return (
    <CatalogManager
      title="Services"
      subtitle="Bookable experiences shown on the public website."
      itemResource="services"
      categoryResource="service-categories"
      itemLabel="Service"
      activeField="is_active"
      showDuration
    />
  );
}
