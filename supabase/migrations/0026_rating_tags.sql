-- 0026: quick chips on the delivery rating ("Fast delivery", "Late" …), stored as short ids the apps translate.
alter table order_ratings add column rider_tags text[] not null default '{}';
