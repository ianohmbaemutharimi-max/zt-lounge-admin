/**
 * CONTRACT MAPPING LAYER
 * 
 * Transforms database snake_case to canonical API camelCase.
 * This is the single source of truth for API contract normalization.
 * 
 * Database (snake_case) → Mapper → API (camelCase) → UI
 */

/**
 * Field mapping definitions for each resource.
 * Maps snake_case database columns to camelCase API fields.
 */
const FIELD_MAPS: Record<string, Record<string, string>> = {
  bookings: {
    id: "id",
    booking_number: "bookingNumber",
    customer_id: "customerId",
    service_id: "serviceId",
    staff_id: "staffId",
    booking_date: "bookingDate",
    start_time: "startTime",
    end_time: "endTime",
    guests: "guests",
    status: "status",
    special_requests: "specialRequests",
    guest_name: "guestName",
    guest_phone: "guestPhone",
    guest_email: "guestEmail",
    price: "price",
    service_charge_id: "serviceChargeId",
    created_by: "createdBy",
    created_at: "createdAt",
    updated_at: "updatedAt",
    // Computed fields (added by enrichment, not from DB)
    customer_name: "customerName",
    customer_phone: "customerPhone", 
    customer_email: "customerEmail",
  },
  // NOTE: customers intentionally has NO field map. The customers list
  // (CustomersView) reads/writes snake_case (full_name, total_visits) and
  // listCanonicalCustomers enriches with snake_case total_visits. Mapping to
  // camelCase caused names to arrive as `fullName` while the UI expected
  // `full_name`, so the Name column displayed blank.
  // customers: {
  //   id: "id",
  //   full_name: "fullName",
  //   phone: "phone",
  //   email: "email",
  //   gender: "gender",
  //   date_of_birth: "dateOfBirth",
  //   notes: "notes",
  //   marketing_opt_in: "marketingOptIn",
  //   source: "source",
  //   is_active: "isActive",
  //   created_at: "createdAt",
  //   updated_at: "updatedAt",
  // },
  // NOTE: services intentionally has NO field map. The services admin
  // (CatalogManager) reads/writes snake_case (is_active, category_id,
  // media_id, page_id) — same contract as menu_items/service_categories.
  // Mapping services to camelCase here caused rows to arrive without
  // `is_active`, so the Active/Inactive control always saw `undefined`
  // (falsy) and the Power toggle could never deactivate a service.

  staff: {
    id: "id",
    profile_id: "profileId",
    employee_number: "employeeNumber",
    full_name: "fullName",
    email: "email",
    phone: "phone",
    position: "position",
    bio: "bio",
    photo_url: "photoUrl",
    hire_date: "hireDate",
    is_active: "isActive",
    created_at: "createdAt",
    updated_at: "updatedAt",
  },
  notifications: {
    id: "id",
    profile_id: "profileId",
    booking_id: "bookingId",
    entity_type: "entityType",
    entity_id: "entityId",
    title: "title",
    message: "body",
    type: "type",
    is_read: "isRead",
    read_at: "readAt",
    created_at: "createdAt",
  },
  contact_messages: {
    id: "id",
    full_name: "fullName",
    phone: "phone",
    email: "email",
    subject: "subject",
    message: "message",
    status: "status",
    replied_by: "repliedBy",
    replied_at: "repliedAt",
    created_at: "createdAt",
  },
  // Add more resources as needed
};

/**
 * Maps a single database row from snake_case to camelCase.
 * Only applies to resources with explicit field maps.
 * 
 * @param table - Database table name
 * @param row - Database row with snake_case fields
 * @returns Mapped object with camelCase fields, or original if no mapping exists
 */
export function mapToPublicContract(
  table: string,
  row: Record<string, any> | null
): Record<string, any> | null {
  if (!row) return null;

  const fieldMap = FIELD_MAPS[table];
  
  // If no field map exists for this table, return as-is
  if (!fieldMap) {
    return row;
  }

  const result: Record<string, any> = {};

  // Map each field using the field map
  for (const [snakeKey, camelKey] of Object.entries(fieldMap)) {
    if (snakeKey in row) {
      result[camelKey] = row[snakeKey];
    }
  }

  return result;
}

/**
 * Maps an array of database rows from snake_case to camelCase.
 * 
 * @param table - Database table name
 * @param rows - Array of database rows
 * @returns Array of mapped objects with camelCase fields
 */
export function mapArrayToPublicContract(
  table: string,
  rows: any[]
): any[] {
  return rows.map((row) => mapToPublicContract(table, row)).filter((row) => row !== null);
}

/**
 * Maps camelCase API input to snake_case for database writes.
 * This is the inverse operation of mapToPublicContract.
 * 
 * @param table - Database table name
 * @param data - API input with camelCase fields
 * @returns Object with snake_case fields for database
 */
export function mapFromPublicContract(
  table: string,
  data: Record<string, any>
): Record<string, any> {
  const fieldMap = FIELD_MAPS[table];
  
  // If no field map exists for this table, return as-is
  if (!fieldMap) {
    return data;
  }

  const result: Record<string, any> = {};

  // Build reverse map (camelCase → snake_case)
  const reverseMap: Record<string, string> = {};
  for (const [snakeKey, camelKey] of Object.entries(fieldMap)) {
    reverseMap[camelKey] = snakeKey;
  }

  // Map each field using the reverse map
  for (const [key, value] of Object.entries(data)) {
    const snakeKey = reverseMap[key];
    if (snakeKey) {
      result[snakeKey] = value;
    } else {
      // If no mapping exists, pass through as-is (might be snake_case already)
      result[key] = value;
    }
  }

  return result;
}
