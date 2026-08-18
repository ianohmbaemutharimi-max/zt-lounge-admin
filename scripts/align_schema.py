import re
import os

script_dir = os.path.dirname(os.path.abspath(__file__))
admin_dir = os.path.dirname(script_dir)
schema_path = os.path.join(admin_dir, 'src', 'db', 'schema.ts')

print(f"Schema path: {schema_path}")

with open(schema_path, 'r') as f:
    content = f.read()

# Remove tsrange import if present
content = content.replace(
    '  serial,\n  tsrange,\n} from "drizzle-orm/pg-core";',
    '  serial,\n} from "drizzle-orm/pg-core";'
)

# Remove during column if present (tsrange not available in this drizzle version)
content = content.replace(
    '  endTime: time("end_time").notNull(),\n  during: tsrange("during"),\n  guests: smallint("guests").default(1).notNull(),',
    '  endTime: time("end_time").notNull(),\n  guests: smallint("guests").default(1).notNull(),'
)

# Ensure userId exists in profiles
if 'userId: uuid("user_id").unique()' not in content:
    content = content.replace(
        '  id: uuid("id").primaryKey().defaultRandom(),\n  fullName: text("full_name").notNull(),',
        '  id: uuid("id").primaryKey().defaultRandom(),\n  userId: uuid("user_id").unique(),\n  fullName: text("full_name").notNull(),'
    )

# Ensure services.categoryId is NOT NULL
if '.notNull()' not in content.split('serviceCategories')[1].split('name:')[0]:
    content = content.replace(
        '  categoryId: uuid("category_id").references(() => serviceCategories.id, { onDelete: "restrict" }),',
        '  categoryId: uuid("category_id").references(() => serviceCategories.id, { onDelete: "restrict" }).notNull(),'
    )

# Ensure slug exists in websitePages
if 'slug: text("slug")' not in content:
    content = content.replace(
        '  pageKey: text("page_key").notNull().unique(),\n  title: text("title").notNull(),',
        '  pageKey: text("page_key").notNull().unique(),\n  slug: text("slug").notNull().unique(),\n  title: text("title").notNull(),'
    )

with open(schema_path, 'w') as f:
    f.write(content)

print('Schema alignment complete (tsrange skipped)')