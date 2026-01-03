# Supabase Setup (SI-TUNTAS)

## 1) Buat Project
- Buat project baru di Supabase.
- Catat `Project URL` dan `anon public key` (menu: **Project Settings → API**).

## 2) Jalankan SQL Schema
- Buka **SQL Editor** di Supabase.
- Jalankan file: `supabase/schema.sql`.

Ini akan membuat tabel:
- `public.profiles` (role + wali_kelas)
- `public.students`
- `public.tasks`

Tabel tambahan (opsional, untuk pengembangan akademik):
- `public.classes` (daftar rombel + wali kelas)
- `public.academic_terms` (tahun ajaran + semester)
- `public.subjects` (master mapel)
- `public.teacher_assignments` (penugasan guru per mapel/kelas/term)
- `public.task_actions` (log treatment/remedial per kasus)

…beserta trigger auto-create profile saat user dibuat, dan RLS policies.

## 3) Buat Akun
- Buat user lewat **Authentication → Users → Add user**.
- Setelah user dibuat, baris `profiles` dibuat otomatis dengan role default `guru`.

Untuk mengubah role menjadi admin/wali kelas:
- Buka **Table Editor → profiles**
- Edit kolom `role` dan bila `role = walikelas` isi `wali_kelas` (contoh: `X-A`).

## 4) Catatan RLS
- Admin: full access ke semua data.
- Guru: read student + full CRUD tasks.
- Wali kelas: read student hanya untuk kelas wali-nya, dan read tasks hanya untuk kelas wali-nya.

Policy `students_select_walikelas` sudah diperketat: wali kelas hanya bisa melihat siswa di kelas yang sama dengan `profiles.wali_kelas`.

## 5) Data Ketuntasan / Treatment
Tabel `public.tasks` dipakai untuk mencatat "nilai/ketuntasan yang belum tuntas" per siswa per mapel.

Kolom penting:
- `mapel`, `deskripsi`: apa yang belum tuntas
- `is_done`: status tuntas / belum
- `created_by`: guru yang input
- `due_date` (opsional): target penyelesaian
- `treatment_note` (opsional): catatan treatment/remedial
- `resolved_at`, `updated_by`: otomatis diisi aplikasi saat status diubah

Jika butuh histori treatment yang lebih detail (lebih dari 1 catatan), gunakan tabel `public.task_actions`.

## 6) Input Data Siswa
Cara tercepat:
- **Table Editor → students → Insert row** (manual), atau
- Import CSV (jika tersedia di UI Supabase) dengan kolom: `nama, kelas, nis, ortu`.

Template siap pakai (tinggal ganti isinya):
- CSV: [students_template.csv](students_template.csv)
- SQL seed massal: [seed_students.sql](seed_students.sql)

Catatan:
- Kolom `nis` wajib unik. Jika ada duplikat, insert akan gagal.
- Untuk role `walikelas`, RLS membatasi insert/update siswa hanya untuk kelas yang sama dengan `profiles.wali_kelas`.
