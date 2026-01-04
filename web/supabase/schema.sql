-- Jalankan di Supabase SQL Editor
-- Membuat tabel profiles + students + tasks, lengkap dengan RLS minimal.

-- 1) Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'guru', 'walikelas')),
  email text,
  display_name text,
  wali_kelas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Jika schema sudah pernah dijalankan, kolom baru ditambahkan jika belum ada
alter table public.profiles add column if not exists email text;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create profile saat user dibuat (role default: guru)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'guru')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 2) Students
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  kelas text not null,
  nis text not null,
  ortu text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_students_updated_at on public.students;
create trigger trg_students_updated_at
before update on public.students
for each row execute function public.set_updated_at();

create unique index if not exists students_nis_unique on public.students (nis);
create index if not exists students_kelas_idx on public.students (kelas);

-- 3) Tasks
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  mapel text not null,
  deskripsi text not null,
  is_done boolean not null default false,
  created_by uuid references auth.users(id),
  due_date date,
  treatment_note text,
  resolved_at timestamptz,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Jika schema sudah pernah dijalankan, jalankan ulang file ini aman karena kolom ditambahkan jika belum ada
alter table public.tasks add column if not exists due_date date;
alter table public.tasks add column if not exists treatment_note text;
alter table public.tasks add column if not exists resolved_at timestamptz;
alter table public.tasks add column if not exists updated_by uuid references auth.users(id);

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create index if not exists tasks_student_id_idx on public.tasks (student_id);

-- 3b) Tabel Akademik Tambahan (opsional, untuk pengawasan & penugasan)

-- Daftar kelas/rombel + wali kelas (mengacu ke profiles)
create table if not exists public.classes (
  name text primary key,
  wali_kelas_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_classes_updated_at on public.classes;
create trigger trg_classes_updated_at
before update on public.classes
for each row execute function public.set_updated_at();

create index if not exists classes_wali_kelas_idx on public.classes (wali_kelas_user_id);

-- Seed data kelas (agar teacher_assignments.class_name bisa diisi)
insert into public.classes (name)
values
  ('X-A'),('X-B'),('X-C'),('X-D'),('X-E'),('X-F'),
  ('XI-A'),('XI-B'),('XI-C'),('XI-D'),
  ('XII-A'),('XII-B'),('XII-C'),('XII-D'),('XII-E'),('XII-F')
on conflict (name) do nothing;

-- Tahun ajaran + semester
create table if not exists public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  tahun_ajaran text not null,
  semester smallint not null check (semester in (1, 2)),
  is_active boolean not null default false,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tahun_ajaran, semester)
);

drop trigger if exists trg_academic_terms_updated_at on public.academic_terms;
create trigger trg_academic_terms_updated_at
before update on public.academic_terms
for each row execute function public.set_updated_at();

create index if not exists academic_terms_active_idx on public.academic_terms (is_active);

-- Master mapel (untuk referensi penugasan guru; aplikasi saat ini masih pakai tasks.mapel text)
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  group_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_subjects_updated_at on public.subjects;
create trigger trg_subjects_updated_at
before update on public.subjects
for each row execute function public.set_updated_at();

-- Seed data mapel (agar admin bisa membuat teacher_assignments)
insert into public.subjects (name, group_name)
values
  (E'Al-Qur''an Hadis','PAI'),
  ('Akidah Akhlak','PAI'),
  ('Fikih','PAI'),
  ('Sejarah Kebudayaan Islam (SKI)','PAI'),
  ('Bahasa Arab','PAI'),
  ('Pendidikan Pancasila','Umum'),
  ('Bahasa Indonesia','Umum'),
  ('Matematika','Umum'),
  ('Bahasa Inggris','Umum'),
  ('Sejarah','Umum'),
  ('Seni Budaya','Umum'),
  ('Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)','Umum'),
  ('Prakarya & Kewirausahaan','Umum'),
  ('Informatika','Umum'),
  -- KMA 1503/2025 (MA Fase E kelas X) menuliskan IPA/IPS terintegrasi; sekolah boleh mengorganisasi terpisah.
  ('Ilmu Pengetahuan Alam (Fisika, Kimia, Biologi)','Umum'),
  ('Ilmu Pengetahuan Sosial (Sosiologi, Ekonomi, Sejarah, Geografi)','Umum'),
  ('Koding dan Kecerdasan Artifisial (KKA)','Umum'),
  ('Fisika','PilihanMIPA_IPS_BHS'),
  ('Kimia','PilihanMIPA_IPS_BHS'),
  ('Biologi','PilihanMIPA_IPS_BHS'),
  ('Geografi','PilihanMIPA_IPS_BHS'),
  ('Ekonomi','PilihanMIPA_IPS_BHS'),
  ('Sosiologi','PilihanMIPA_IPS_BHS'),
  ('Antropologi','PilihanMIPA_IPS_BHS'),
  ('Matematika Tingkat Lanjut','PilihanMIPA_IPS_BHS'),
  ('Sejarah Tingkat Lanjut','PilihanMIPA_IPS_BHS'),
  ('Bahasa Indonesia Tingkat Lanjut','PilihanMIPA_IPS_BHS'),
  ('Bahasa Inggris Tingkat Lanjut','PilihanMIPA_IPS_BHS'),
  ('Bahasa Arab Tingkat Lanjut','PilihanMIPA_IPS_BHS'),
  ('Bahasa Daerah','PilihanMIPA_IPS_BHS'),
  ('Bahasa Jepang','PilihanMIPA_IPS_BHS'),
  ('Bahasa Jerman','PilihanMIPA_IPS_BHS'),
  ('Bahasa Korea','PilihanMIPA_IPS_BHS'),
  ('Bahasa Mandarin','PilihanMIPA_IPS_BHS'),
  ('Bahasa Prancis','PilihanMIPA_IPS_BHS'),
  ('Ilmu Kalam','PilihanKeagamaan'),
  ('Ilmu Tafsir','PilihanKeagamaan'),
  ('Ilmu Hadis','PilihanKeagamaan'),
  ('Ushul Fikih','PilihanKeagamaan'),
  ('Aswaja/Ke-NU-an','MuatanLokal')
on conflict (name) do nothing;

-- Penugasan guru: guru siapa mengajar mapel apa di kelas mana (per term)
create table if not exists public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  class_name text references public.classes(name) on delete set null,
  term_id uuid references public.academic_terms(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, subject_id, class_name, term_id)
);

drop trigger if exists trg_teacher_assignments_updated_at on public.teacher_assignments;
create trigger trg_teacher_assignments_updated_at
before update on public.teacher_assignments
for each row execute function public.set_updated_at();

create index if not exists teacher_assignments_teacher_idx on public.teacher_assignments (teacher_id);
create index if not exists teacher_assignments_class_idx on public.teacher_assignments (class_name);

-- Log treatment/remedial per kasus (lebih detail daripada 1 field treatment_note)
create table if not exists public.task_actions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('note', 'remedial', 'call_parent', 'home_visit', 'mark_done', 'mark_undone', 'other')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists task_actions_task_idx on public.task_actions (task_id);
create index if not exists task_actions_actor_idx on public.task_actions (actor_id);

-- 4) RLS
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.tasks enable row level security;
alter table public.classes enable row level security;
alter table public.academic_terms enable row level security;
alter table public.subjects enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.task_actions enable row level security;

-- Helper: cek role user dari profiles
-- NOTE: SECURITY DEFINER is required here to avoid RLS recursion.
-- If this function runs as INVOKER, selecting from public.profiles can trigger
-- policies that call public.my_role() again, causing: stack depth limit exceeded.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Profiles policies
-- User bisa baca profil dirinya
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select using (id = auth.uid());

-- Admin bisa baca semua profil
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
for select using (public.my_role() = 'admin');

-- Admin bisa update profil (termasuk set role/wali_kelas)
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
for update using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Students policies
-- Admin bisa full access
drop policy if exists "students_all_admin" on public.students;
create policy "students_all_admin" on public.students
for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Guru bisa membaca semua data siswa (read-only)
drop policy if exists "students_select_staff" on public.students;
drop policy if exists "students_select_guru" on public.students;
create policy "students_select_guru" on public.students
for select
using (
  public.my_role() = 'guru'
  and exists (
    select 1
    from public.teacher_assignments ta
    where ta.teacher_id = auth.uid()
      and ta.class_name is not null
      and ta.class_name = public.students.kelas
  )
);

-- Wali kelas hanya bisa membaca siswa di kelas wali-nya
drop policy if exists "students_select_walikelas" on public.students;
create policy "students_select_walikelas" on public.students
for select
using (
  public.my_role() = 'walikelas'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.wali_kelas is not null
      and public.students.kelas = p.wali_kelas
  )
);

-- Wali kelas boleh melengkapi data siswa (INSERT/UPDATE) hanya untuk kelas wali-nya
drop policy if exists "students_insert_walikelas" on public.students;
create policy "students_insert_walikelas" on public.students
for insert
with check (
  public.my_role() = 'walikelas'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.wali_kelas is not null
      and public.students.kelas = p.wali_kelas
  )
);

drop policy if exists "students_update_walikelas" on public.students;
create policy "students_update_walikelas" on public.students
for update
using (
  public.my_role() = 'walikelas'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.wali_kelas is not null
      and public.students.kelas = p.wali_kelas
  )
)
with check (
  public.my_role() = 'walikelas'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.wali_kelas is not null
      and public.students.kelas = p.wali_kelas
  )
);

-- Guru boleh melengkapi data siswa (INSERT/UPDATE) hanya untuk kelas yang dia ajar
drop policy if exists "students_insert_guru_assigned" on public.students;
create policy "students_insert_guru_assigned" on public.students
for insert
with check (
  public.my_role() = 'guru'
  and exists (
    select 1
    from public.teacher_assignments ta
    where ta.teacher_id = auth.uid()
      and ta.class_name is not null
      and ta.class_name = public.students.kelas
  )
);

drop policy if exists "students_update_guru_assigned" on public.students;
create policy "students_update_guru_assigned" on public.students
for update
using (
  public.my_role() = 'guru'
  and exists (
    select 1
    from public.teacher_assignments ta
    where ta.teacher_id = auth.uid()
      and ta.class_name is not null
      and ta.class_name = public.students.kelas
  )
)
with check (
  public.my_role() = 'guru'
  and exists (
    select 1
    from public.teacher_assignments ta
    where ta.teacher_id = auth.uid()
      and ta.class_name is not null
      and ta.class_name = public.students.kelas
  )
);

-- Tasks policies
-- Admin full access
drop policy if exists "tasks_all_admin" on public.tasks;
create policy "tasks_all_admin" on public.tasks
for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Guru bisa insert/update/delete task (untuk input tagihan)
drop policy if exists "tasks_write_guru" on public.tasks;
create policy "tasks_write_guru" on public.tasks
for all
using (
  public.my_role() = 'guru'
  and exists (
    select 1
    from public.students s
    join public.teacher_assignments ta
      on ta.teacher_id = auth.uid()
     and ta.class_name is not null
     and ta.class_name = s.kelas
    where s.id = public.tasks.student_id
  )
)
with check (
  public.my_role() = 'guru'
  and exists (
    select 1
    from public.students s
    join public.teacher_assignments ta
      on ta.teacher_id = auth.uid()
     and ta.class_name is not null
     and ta.class_name = s.kelas
    where s.id = public.tasks.student_id
  )
);

-- WaliKelas bisa baca task untuk kelas wali-nya
drop policy if exists "tasks_select_walikelas" on public.tasks;
create policy "tasks_select_walikelas" on public.tasks
for select
using (
  public.my_role() = 'walikelas'
  and exists (
    select 1
    from public.students s
    join public.profiles p on p.id = auth.uid()
    where s.id = public.tasks.student_id
      and p.wali_kelas is not null
      and s.kelas = p.wali_kelas
  )
);

-- Classes policies
drop policy if exists "classes_all_admin" on public.classes;
create policy "classes_all_admin" on public.classes
for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists "classes_select_staff" on public.classes;
create policy "classes_select_staff" on public.classes
for select using (public.my_role() in ('guru', 'walikelas'));

-- Academic terms policies
drop policy if exists "academic_terms_all_admin" on public.academic_terms;
create policy "academic_terms_all_admin" on public.academic_terms
for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists "academic_terms_select_staff" on public.academic_terms;
create policy "academic_terms_select_staff" on public.academic_terms
for select using (public.my_role() in ('guru', 'walikelas'));

-- Subjects policies
drop policy if exists "subjects_all_admin" on public.subjects;
create policy "subjects_all_admin" on public.subjects
for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists "subjects_select_staff" on public.subjects;
create policy "subjects_select_staff" on public.subjects
for select using (public.my_role() in ('guru', 'walikelas'));

-- Teacher assignments policies
drop policy if exists "teacher_assignments_all_admin" on public.teacher_assignments;
create policy "teacher_assignments_all_admin" on public.teacher_assignments
for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists "teacher_assignments_select_own" on public.teacher_assignments;
create policy "teacher_assignments_select_own" on public.teacher_assignments
for select using (public.my_role() = 'guru' and teacher_id = auth.uid());

drop policy if exists "teacher_assignments_select_walikelas" on public.teacher_assignments;
create policy "teacher_assignments_select_walikelas" on public.teacher_assignments
for select
using (
  public.my_role() = 'walikelas'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.wali_kelas is not null
      and public.teacher_assignments.class_name = p.wali_kelas
  )
);

-- Task actions policies
drop policy if exists "task_actions_all_admin" on public.task_actions;
create policy "task_actions_all_admin" on public.task_actions
for all using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists "task_actions_write_guru" on public.task_actions;
create policy "task_actions_write_guru" on public.task_actions
for all using (public.my_role() = 'guru') with check (public.my_role() = 'guru');

drop policy if exists "task_actions_select_walikelas" on public.task_actions;
create policy "task_actions_select_walikelas" on public.task_actions
for select
using (
  public.my_role() = 'walikelas'
  and exists (
    select 1
    from public.tasks t
    join public.students s on s.id = t.student_id
    join public.profiles p on p.id = auth.uid()
    where t.id = public.task_actions.task_id
      and p.wali_kelas is not null
      and s.kelas = p.wali_kelas
  )
);
