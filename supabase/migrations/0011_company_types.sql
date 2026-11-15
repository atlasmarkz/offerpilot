-- 公司类型新增：芯片半导体（chip）、汽车（auto）、硬件制造（hardware）。可重复运行。
alter table job_listing drop constraint if exists job_listing_company_type_check;
alter table job_listing add constraint job_listing_company_type_check
  check (company_type in ('internet', 'finance', 'soe', 'chip', 'auto', 'hardware'));
notify pgrst, 'reload schema';
