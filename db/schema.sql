-- SA Team Hub schema.
--
-- Design notes:
-- * Every table that holds personal data is keyed by person_id so access rules
--   ("an IC sees only their own rows") can be enforced with a simple WHERE clause
--   in agent/lib/data.ts rather than spread across the UI.
-- * Manager-only data (retention, succession, bench, promotion cases) lives in
--   separate tables so it can never be returned by accident from a broad
--   "select * from people" style query.

create table if not exists people (
  id            text primary key,           -- slug, e.g. 'priya-nair'
  name          text not null,
  title         text not null,              -- 'Solutions Architect', 'Senior SA', ...
  level         text not null,              -- framework level: SA1 | SA2 | SSA | PSA | MGR
  role          text not null check (role in ('ic', 'manager')),
  segment       text not null,              -- Enterprise | Public Sector | Commercial | Strategic
  location      text not null,
  start_date    date not null,
  manager_id    text references people(id)
);

-- Slack member id (e.g. U0123ABCD), set by a manager on the Settings page. The
-- Slack channel only answers people listed here; anyone else is refused.
alter table people add column if not exists slack_user_id text unique;

-- Skills Matrix: product skills, certifications and enablement in one table so
-- the gap analysis can reason across all three. Product skills use level 0-4
-- (None, Elevator, Present, Demo, Prove);
-- certifications and enablement use status + dates.
create table if not exists skills (
  person_id     text not null references people(id),
  category      text not null check (category in ('product', 'certification', 'enablement')),
  name          text not null,
  level         int check (level between 0 and 4),
  status        text check (status in ('not_started', 'in_progress', 'complete')),
  completed_on  date,
  due_on        date,
  updated_at    timestamptz not null default now(),
  primary key (person_id, category, name)
);

-- What the team needs next quarter. find_skill_gaps compares this with skills.
create table if not exists skill_needs (
  category      text not null,
  name          text not null,
  min_level     int,                         -- for product skills
  min_people    int not null,                -- how many people must meet it
  reason        text not null,
  primary key (category, name)
);

create table if not exists achievements (
  id            bigserial primary key,
  person_id     text not null references people(id),
  occurred_on   date not null,
  category      text not null check (category in ('customer', 'pipeline', 'enablement', 'community', 'leadership')),
  title         text not null,
  impact        text not null,
  logged_by     text not null,               -- principal that wrote it (person id or 'eve:app')
  idempotency_key text unique,               -- lets a replayed agent step write exactly once
  created_at    timestamptz not null default now()
);

create table if not exists dev_plans (
  id            bigserial primary key,
  person_id     text not null references people(id),
  goal          text not null,
  target_level  text not null,
  next_step     text not null,
  due_on        date not null,
  status        text not null check (status in ('on_track', 'at_risk', 'done')),
  updated_at    timestamptz not null default now()
);

-- Where each person wants their career to go (Principal SA, Manager, Product
-- Manager...). Dev Plans groups people under these headings. The person and
-- managers can change it; the allowed values live in agent/lib/career-goals.ts.
create table if not exists career_goals (
  person_id     text primary key references people(id),
  goal          text not null,
  note          text not null default '',
  updated_by    text not null,               -- person id of whoever last changed it
  updated_at    timestamptz not null default now()
);

-- Deal coverage, from the plan's "SA Sales Activities": stage 2+ deals should
-- have an SA, a current next step, and a presales stage that agrees with the
-- sales forecast (a tech win should be in Commit or Strong Upside, and a Commit
-- should already have its tech win).
create table if not exists deals (
  id             text primary key,
  account        text not null,
  ae             text not null,
  sa_id          text references people(id),
  stage          int not null check (stage between 1 and 5),
  acv_usd        int not null,
  close_quarter  text not null,
  next_step      text not null,
  next_step_on   date not null,               -- when the next step was last updated
  presales_stage text not null default 'discovery'
                 check (presales_stage in ('discovery', 'solution_design', 'technical_validation', 'tech_win')),
  forecast       text not null default 'pipeline'
                 check (forecast in ('pipeline', 'upside', 'strong_upside', 'commit', 'closed'))
);

-- Upgrade a database created before presales_stage and forecast existed: the old
-- tech_win flag becomes presales_stage 'tech_win'. Safe to run repeatedly.
alter table deals add column if not exists presales_stage text not null default 'discovery'
  check (presales_stage in ('discovery', 'solution_design', 'technical_validation', 'tech_win'));
alter table deals add column if not exists forecast text not null default 'pipeline'
  check (forecast in ('pipeline', 'upside', 'strong_upside', 'commit', 'closed'));
do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'deals' and column_name = 'tech_win') then
    update deals set presales_stage = 'tech_win' where tech_win;
    alter table deals drop column tech_win;
  end if;
end $$;

-- CRM change log: every next-step update made through the agent, with who made it.
-- idempotency_key is the tool call id, so a replayed step logs (and updates) once.
create table if not exists deal_updates (
  id              serial primary key,
  deal_id         text not null references deals(id) on delete cascade,
  next_step       text not null,
  presales_stage  text,
  updated_by      text not null references people(id),
  idempotency_key text not null unique,
  created_at      timestamptz not null default now()
);
alter table deal_updates add column if not exists presales_stage text;
alter table deal_updates drop column if exists tech_win;

-- Slack message for each week's digest, so a re-saved digest edits the same
-- post instead of posting twice.
alter table digests add column if not exists slack_ts text;

-- App-wide settings a manager can change, such as the primary model.
create table if not exists app_settings (
  key           text primary key,
  value         text not null,
  updated_by    text not null,
  updated_at    timestamptz not null default now()
);

-- ---------- Manager-only tables ----------

create table if not exists retention_risks (
  person_id     text primary key references people(id),
  risk          text not null check (risk in ('low', 'medium', 'high')),
  reason        text not null,
  action_plan   text not null,
  updated_by    text not null,
  updated_at    timestamptz not null default now()
);

create table if not exists succession (
  id            bigserial primary key,
  role_name     text not null,               -- the role being covered, e.g. 'SA Manager, ANZ'
  candidate     text not null,
  kind          text not null check (kind in ('internal', 'external')),
  person_id     text references people(id),  -- set for internal candidates
  readiness     text not null check (readiness in ('ready_now', 'one_year', 'two_years')),
  pros          text not null,
  cons          text not null
);

-- Warm bench: people we would hire tomorrow if a role opened.
create table if not exists candidates (
  id            bigserial primary key,
  name          text not null,
  current_job   text not null,
  focus         text not null,
  stage         text not null check (stage in ('warm', 'engaged', 'interviewing', 'offer')),
  last_contact  date not null,
  source        text not null,
  notes         text not null
);

-- Output of the draft_promotion_case workflow.
create table if not exists promotion_cases (
  id            bigserial primary key,
  person_id     text not null references people(id),
  target_level  text not null,
  status        text not null check (status in ('pending_approval', 'approved', 'rejected')),
  summary       text not null,
  case_json     jsonb not null,
  model_used    text not null,
  created_by    text not null,
  decided_by    text,
  workflow_call text unique,                 -- tool call id, makes the save step idempotent
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);

-- Written by the Friday digest schedule, shown on the dashboard home page.
create table if not exists digests (
  id            bigserial primary key,
  week_of       date not null unique,
  body          text not null,
  created_at    timestamptz not null default now()
);
