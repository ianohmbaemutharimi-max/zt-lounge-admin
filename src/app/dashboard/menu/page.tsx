"use client";

import { CatalogManager } from "@/features/services/catalog-manager";

export default function MenuPage() {
  return (
    <CatalogManager
      title="Menu"
      subtitle="Food & drinks menu published on the public website."
      itemResource="menu-items"
      categoryResource="menu-categories"
      itemLabel="Item"
      activeField="isAvailable"
      showFeatured
    />
  );
}
