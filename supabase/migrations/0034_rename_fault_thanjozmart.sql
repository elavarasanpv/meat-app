-- 0034: rebrand. The support "whose fault" value for our own mistakes was
-- 'freshcut'; it is now 'thanjozmart'. Swap the check, then move old rows.

alter table tickets drop constraint if exists tickets_fault_check;

update tickets set fault = 'thanjozmart' where fault = 'freshcut';

alter table tickets
  add constraint tickets_fault_check
    check (fault in ('shop', 'rider', 'thanjozmart', 'customer', 'none'));
