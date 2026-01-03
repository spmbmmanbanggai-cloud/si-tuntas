-- Contoh seed massal students
-- Jalankan di Supabase SQL Editor (atau psql). Sesuaikan data sesuai kebutuhan.
-- Catatan: NIS harus unik.

insert into public.students (nama, kelas, nis, ortu)
values
  ('Ahmad Fauzan', 'X-A', '10001', 'Bpk/Ibu ...'),
  ('Siti Aisyah', 'X-A', '10002', 'Bpk/Ibu ...'),
  ('Muhammad Rizki', 'XI-B', '11015', 'Bpk/Ibu ...');
