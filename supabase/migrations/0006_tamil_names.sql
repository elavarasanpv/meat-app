-- Tamil display names for the catalog. The app shows name_ta when the
-- language is Tamil and falls back to the English name when it is empty.

alter table categories    add column if not exists name_ta text;
alter table subcategories add column if not exists name_ta text;
alter table products      add column if not exists name_ta text;

comment on column categories.name_ta    is 'Tamil display name; null = show English name.';
comment on column subcategories.name_ta is 'Tamil display name; null = show English name.';
comment on column products.name_ta      is 'Tamil display name; null = show English name.';

-- Categories
update categories set name_ta = 'கோழி'      where name = 'Chicken';
update categories set name_ta = 'ஆட்டுக்கறி' where name = 'Mutton';
update categories set name_ta = 'மீன்'       where name = 'Fish';
update categories set name_ta = 'முட்டை'     where name = 'Eggs';

-- Sub-categories
update subcategories set name_ta = 'பிராய்லர் கோழி' where name = 'Broiler chicken';
update subcategories set name_ta = 'நாட்டுக்கோழி'   where name = 'Country chicken';

-- Products: Broiler chicken
update products set name_ta = 'முழு கோழி'                        where name = 'Whole chicken';
update products set name_ta = 'கறி துண்டு'                        where name = 'Curry cut';
update products set name_ta = 'தோல் உரித்த கறி துண்டு'             where name = 'Skinless curry cut';
update products set name_ta = 'எலும்பில்லாத நெஞ்சு கறி துண்டு'      where name = 'Breast piece (boneless)';
update products set name_ta = 'தொடை கறி / லெக் பீஸ்'              where name = 'Leg piece';
update products set name_ta = 'சிறகு துண்டு'                       where name = 'Wings';

-- Products: Country chicken
update products set name_ta = 'நாட்டு சேவல் (முழு)'                where name = 'Country cock (whole)';
update products set name_ta = 'தோலுடன் நாட்டுக்கோழி துண்டு'          where name = 'Country hen (with skin)';
update products set name_ta = 'தோல் உரித்த நாட்டுக்கோழி துண்டு'      where name = 'Country hen (skinless)';

-- Products: Mutton
update products set name_ta = 'ஆட்டுக்கறி துண்டு'                  where name = 'Goat mutton curry cut';
update products set name_ta = 'எலும்பில்லாத ஆட்டுக்கறி துண்டு'       where name = 'Mutton boneless';

-- Products: Eggs
update products set name_ta = 'நாட்டுக்கோழி முட்டை'                 where name = 'Country chicken eggs';
update products set name_ta = 'பண்ணை வெள்ளை முட்டை'                where name = 'Farm eggs (white)';

insert into supabase_migrations.schema_migrations (version, name)
values ('0006', 'tamil_names') on conflict (version) do nothing;
