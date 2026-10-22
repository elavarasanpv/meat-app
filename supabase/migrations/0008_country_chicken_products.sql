-- Country chicken: four products — hen/cock, whole/cut.
-- Existing rows are renamed (not deleted) so past orders keep valid product ids.

update products
set name = 'Country cock whole', name_ta = 'நாட்டு சேவல் முழுசு', base_price_per_kg = 380
where name = 'Country cock (whole)';

update products
set name = 'Country hen whole', name_ta = 'நாட்டுக்கோழி முழுசு', base_price_per_kg = 340
where name = 'Country hen (with skin)';

update products
set name = 'Country hen cut', name_ta = 'நாட்டுக்கோழி துண்டு', base_price_per_kg = 360
where name = 'Country hen (skinless)';

insert into products (category_id, subcategory_id, name, name_ta, base_price_per_kg, unit)
select '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000022',
       'Country cock cut', 'நாட்டு சேவல் துண்டு', 400, 'kg'
where not exists (select 1 from products where name = 'Country cock cut');

insert into supabase_migrations.schema_migrations (version, name)
values ('0008', 'country_chicken_products') on conflict (version) do nothing;
