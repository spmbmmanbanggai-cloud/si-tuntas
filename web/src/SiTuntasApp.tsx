import React, { useEffect, useState } from 'react';
import {
  Users,
  FileWarning,
  CheckCircle,
  XCircle,
  Printer,
  BookOpen,
  AlertTriangle,
  Search,
  Plus,
  Trash2,
  School,
  FileText,
} from 'lucide-react';

import type { AppRole } from './auth/AuthGate';
import { supabase, supabaseConfigError } from './lib/supabaseClient';

// --- Konstanta Data Madrasah (MAN) ---

// Daftar Kelas Sesuai Permintaan
const CLASSES = [
  // Kelas X (Fase E)
  'X-A',
  'X-B',
  'X-C',
  'X-D',
  'X-E',
  'X-F',
  // Kelas XI (Fase F)
  'XI-A',
  'XI-B',
  'XI-C',
  'XI-D',
  // Kelas XII (Fase F)
  'XII-A',
  'XII-B',
  'XII-C',
  'XII-D',
  'XII-E',
  'XII-F',
];

// Struktur Kurikulum KMA (PAI, Umum, Pilihan) untuk MA
const SUBJECTS = {
  PAI: [
    "Al-Qur'an Hadis",
    'Akidah Akhlak',
    'Fikih',
    'Sejarah Kebudayaan Islam (SKI)',
    'Bahasa Arab',
  ],
  Umum: [
    'Pendidikan Pancasila',
    'Bahasa Indonesia',
    'Matematika',
    'Bahasa Inggris',
    'Sejarah',
    'Seni Budaya',
    'PJOK',
    'Informatika',
    'Prakarya/Kewirausahaan',
  ],
  PilihanMIPA_IPS_BHS: [
    'Biologi',
    'Fisika',
    'Kimia',
    'Sosiologi',
    'Ekonomi',
    'Geografi',
    'Bahasa Inggris Tingkat Lanjut',
    'Bahasa Arab Tingkat Lanjut',
  ],
  PilihanKeagamaan: ['Ilmu Hadits', 'Ilmu Tafsir', 'Ushul Fiqih'],
  MuatanLokal: ['Tahfidz', 'Riset/KIR'],
};

// --- Tipe Data ---

type Task = {
  id: string;
  mapel: string;
  deskripsi: string;
  isDone: boolean;
  createdBy?: string | null;
  dueDate?: string | null;
  treatmentNote?: string | null;
};

type Student = {
  id: string;
  nama: string;
  kelas: string;
  nis: string;
  ortu: string;
  tasks: Task[];
};

type StudentRow = {
  id: string;
  nama: string;
  kelas: string;
  nis: string;
  ortu: string | null;
};

type TaskRow = {
  id: string;
  student_id: string;
  mapel: string;
  deskripsi: string;
  is_done: boolean;
  created_by: string | null;
  due_date: string | null;
  treatment_note: string | null;
};

export default function SiTuntasApp(
  props: {
    role?: AppRole;
    waliKelas?: string | null;
    userId?: string;
    userEmail?: string | null;
    reloadProfile?: () => Promise<void>;
  } = {},
) {
  if (supabaseConfigError || !supabase) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800">Konfigurasi Supabase belum siap</h2>
          <p className="text-sm text-slate-600 mt-2">{supabaseConfigError ?? 'Supabase client is not configured'}</p>
          <p className="text-sm text-slate-600 mt-2">
            Pastikan <span className="font-mono">web/.env</span> terisi, lalu restart server dev.
          </p>
        </div>
      </div>
    );
  }

  const sb = supabase;

  const [students, setStudents] = useState<Student[]>([]);
  const [teacherNamesById, setTeacherNamesById] = useState<Record<string, string>>({});
  const [guruKelasAjar, setGuruKelasAjar] = useState<string[]>([]);
  const [guruMapelAjar, setGuruMapelAjar] = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const canSeeWaliKelas = props.role === 'admin' || props.role === 'walikelas';
  const canManageStudents = props.role === 'admin' || props.role === 'walikelas' || props.role === 'guru';
  const defaultTab: 'dashboard' | 'guru' | 'walikelas' | 'students' | 'teachers' = canSeeWaliKelas ? 'dashboard' : 'guru';
  const [activeTab, setActiveTab] = useState<'dashboard' | 'guru' | 'walikelas' | 'students' | 'teachers'>(defaultTab);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);

  // State untuk Guru: pilih mapel & fokus pencarian siswa bermasalah
  const [guruMapelFilter, setGuruMapelFilter] = useState<string>('');
  const [guruKelasFilter, setGuruKelasFilter] = useState<string>('');
  const [guruOnlyProblematic, setGuruOnlyProblematic] = useState<boolean>(true);

  // State untuk Kelola Siswa (Admin)
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [showImportStudentsModal, setShowImportStudentsModal] = useState(false);

  // State untuk Filter Wali Kelas
  const [waliKelasFilter, setWaliKelasFilter] = useState<string>(props.waliKelas ?? 'X-A');
  const isWaliKelasLocked = props.role === 'walikelas' && !!props.waliKelas;

  const refreshData = async () => {
    setLoadingData(true);
    setDataError(null);

    const [{ data: studentsData, error: studentsError }, { data: tasksData, error: tasksError }] = await Promise.all([
      sb.from('students').select('id,nama,kelas,nis,ortu').order('kelas').order('nama'),
      sb
        .from('tasks')
        .select('id,student_id,mapel,deskripsi,is_done,created_by,due_date,treatment_note')
        .order('created_at'),
    ]);

    if (props.role === 'guru' && props.userId) {
      const { data: assignmentsData, error: assignmentsError } = await sb
        .from('teacher_assignments')
        .select('class_name, subject:subjects(name)')
        .eq('teacher_id', props.userId);

      if (assignmentsError) {
        setGuruKelasAjar([]);
        setGuruMapelAjar([]);
      } else {
        const rows = ((assignmentsData as Array<{ class_name: string | null; subject: Array<{ name: string }> }> | null) ?? []);

        const kelasAll = rows
          .map((r) => (r.class_name ?? '').trim())
          .filter((c) => !!c && CLASSES.includes(c));
        setGuruKelasAjar(Array.from(new Set(kelasAll)).sort());

        const mapelAll = rows
          .map((r) => (r.subject?.[0]?.name ?? '').trim())
          .filter((m) => !!m);
        setGuruMapelAjar(Array.from(new Set(mapelAll)).sort((a, b) => a.localeCompare(b)));
      }
    } else {
      setGuruKelasAjar([]);
      setGuruMapelAjar([]);
    }

    if (props.role === 'admin') {
      const { data: profilesData } = await sb.from('profiles').select('id,display_name')
      const map: Record<string, string> = {}
      ;((profilesData as Array<{ id: string; display_name: string | null }> | null) ?? []).forEach((p) => {
        map[p.id] = p.display_name?.trim() ? p.display_name.trim() : `User ${p.id.slice(0, 8)}`
      })
      setTeacherNamesById(map)
    }

    if (studentsError) {
      setStudents([]);
      setLoadingData(false);
      setDataError(studentsError.message);
      return;
    }

    if (tasksError) {
      setStudents([]);
      setLoadingData(false);
      setDataError(tasksError.message);
      return;
    }

    const tasksByStudent = new Map<string, Task[]>();
    (tasksData as TaskRow[] | null)?.forEach((t) => {
      const next: Task = {
        id: t.id,
        mapel: t.mapel,
        deskripsi: t.deskripsi,
        isDone: t.is_done,
        createdBy: t.created_by,
        dueDate: t.due_date,
        treatmentNote: t.treatment_note,
      };
      const list = tasksByStudent.get(t.student_id) ?? [];
      list.push(next);
      tasksByStudent.set(t.student_id, list);
    });

    const mapped = ((studentsData as StudentRow[] | null) ?? []).map((s) => ({
      id: s.id,
      nama: s.nama,
      kelas: s.kelas,
      nis: s.nis,
      ortu: s.ortu ?? '',
      tasks: tasksByStudent.get(s.id) ?? [],
    }));

    setStudents(mapped);
    setLoadingData(false);
  };

  const upsertStudent = async (payload: { nama: string; kelas: string; nis: string; ortu?: string | null }) => {
    setDataError(null);
    if (!canManageStudents) {
      setDataError('Akses ditolak: hanya admin/guru/wali kelas yang bisa mengelola data siswa.');
      return;
    }

    const effectiveClass =
      props.role === 'walikelas'
        ? (props.waliKelas ?? null)
        : payload.kelas;

    if (props.role === 'walikelas' && !effectiveClass) {
      setDataError('Akun wali kelas belum punya kelas. Set dulu profiles.wali_kelas (contoh: X-A).');
      return;
    }

    if (props.role === 'guru') {
      if (!props.userId) {
        setDataError('Akun guru belum terdeteksi (userId kosong). Silakan logout/login lagi.');
        return;
      }
      if (guruKelasAjar.length === 0) {
        setDataError('Kelas ajar belum di-set. Admin perlu mengisi teacher_assignments untuk akun guru ini.');
        return;
      }
      if (!effectiveClass || !guruKelasAjar.includes(effectiveClass)) {
        setDataError(`Akses ditolak: guru hanya boleh mengelola siswa untuk kelas yang dia ajar (${guruKelasAjar.join(', ')}).`);
        return;
      }
    }

    if (editingStudentId) {
      const { error } = await sb
        .from('students')
        .update({
          nama: payload.nama,
          kelas: effectiveClass,
          nis: payload.nis,
          ortu: payload.ortu ?? null,
        })
        .eq('id', editingStudentId);

      if (error) {
        setDataError(error.message);
        return;
      }
    } else {
      const { error } = await sb.from('students').insert({
        nama: payload.nama,
        kelas: effectiveClass,
        nis: payload.nis,
        ortu: payload.ortu ?? null,
      });

      if (error) {
        setDataError(error.message);
        return;
      }
    }

    setShowStudentModal(false);
    setEditingStudentId(null);
    await refreshData();
  };

  const deleteStudent = async (studentId: string) => {
    setDataError(null);
    if (props.role !== 'admin') {
      setDataError('Akses ditolak: hanya admin yang bisa menghapus data siswa.');
      return;
    }

    const student = students.find((s) => s.id === studentId);
    const label = student ? `${student.nama} (${student.kelas})` : studentId;
    const ok = window.confirm(`Hapus siswa ${label}?\nCatatan: seluruh tagihan/remedial siswa ini juga akan ikut terhapus.`);
    if (!ok) return;

    const { error } = await sb.from('students').delete().eq('id', studentId);
    if (error) {
      setDataError(error.message);
      return;
    }
    await refreshData();
  };

  useEffect(() => {
    void refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isWaliKelasLocked && props.waliKelas) setWaliKelasFilter(props.waliKelas);
  }, [isWaliKelasLocked, props.waliKelas]);

  // --- Logic Helper ---
  const getStatus = (student: Student) => {
    const pendingTasks = student.tasks.filter((t) => !t.isDone);
    return pendingTasks.length > 0 ? 'DITAHAN' : 'AMAN';
  };

  const parseCsv = (text: string): Array<Record<string, string>> => {
    const lines = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((l) => l.trim().length > 0);

    if (lines.length === 0) return [];

    const parseLine = (line: string): string[] => {
      const out: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          out.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      out.push(current);

      return out.map((v) => v.trim());
    };

    const header = parseLine(lines[0]).map((h) => h.toLowerCase());
    const rows: Array<Record<string, string>> = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseLine(lines[i]);
      const row: Record<string, string> = {};
      header.forEach((h, idx) => {
        row[h] = (cols[idx] ?? '').trim().replace(/^"|"$/g, '');
      });
      rows.push(row);
    }

    return rows;
  };

  const totalDitahan = students.filter((s) => getStatus(s) === 'DITAHAN').length;
  const totalAman = students.filter((s) => getStatus(s) === 'AMAN').length;

  // --- Handlers ---
  const toggleTaskStatus = (studentId: string, taskId: string) => {
    const student = students.find((s) => s.id === studentId);
    const task = student?.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const nextDone = !task.isDone;

    setStudents((prev) =>
      prev.map((s) => {
        if (s.id !== studentId) return s;
        return { ...s, tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, isDone: nextDone } : t)) };
      }),
    );

    void (async () => {
      const payload: Record<string, unknown> = {
        is_done: nextDone,
        resolved_at: nextDone ? new Date().toISOString() : null,
      };
      if (props.userId) payload.updated_by = props.userId;

      const { error } = await sb.from('tasks').update(payload).eq('id', taskId);
      if (error) {
        setDataError(error.message);
        await refreshData();
      }
    })();
  };

  const addTask = (
    studentId: string,
    mapel: string,
    deskripsi: string,
    dueDate?: string | null,
    treatmentNote?: string | null,
  ) => {
    void (async () => {
      setDataError(null);
      const payload: Record<string, unknown> = {
        student_id: studentId,
        mapel,
        deskripsi,
        is_done: false,
      };
      if (props.userId) payload.created_by = props.userId;
      if (dueDate) payload.due_date = dueDate;
      if (treatmentNote) payload.treatment_note = treatmentNote;

      const { data, error } = await sb
        .from('tasks')
        .insert(payload)
        .select('id,student_id,mapel,deskripsi,is_done,created_by,due_date,treatment_note')
        .single();

      if (error) {
        setDataError(error.message);
        return;
      }

      const inserted = data as TaskRow;
      setStudents((prev) =>
        prev.map((s) => {
          if (s.id !== inserted.student_id) return s;
          return {
            ...s,
            tasks: [
              ...s.tasks,
              {
                id: inserted.id,
                mapel: inserted.mapel,
                deskripsi: inserted.deskripsi,
                isDone: inserted.is_done,
                createdBy: inserted.created_by,
                dueDate: inserted.due_date,
                treatmentNote: inserted.treatment_note,
              },
            ],
          };
        }),
      );
    })();
  };

  const deleteTask = (studentId: string, taskId: string) => {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.id !== studentId) return s;
        return { ...s, tasks: s.tasks.filter((t) => t.id !== taskId) };
      }),
    );

    void (async () => {
      const { error } = await sb.from('tasks').delete().eq('id', taskId);
      if (error) {
        setDataError(error.message);
        await refreshData();
      }
    })();
  };

  // --- Components ---

  const AdminCreateTeacherCard = (propsCard?: { onCreated?: () => Promise<void> }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [accountRole, setAccountRole] = useState<'admin' | 'guru' | 'walikelas'>('guru');
    const [waliKelas, setWaliKelas] = useState<string>(CLASSES[0] ?? 'X-A');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    if (props.role !== 'admin') return null;

    const onSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      void (async () => {
        setDataError(null);
        setResult(null);
        setBusy(true);
        try {
          const { data: sessionData } = await sb.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (!accessToken) {
            setDataError('Session login tidak ditemukan / sudah kadaluarsa. Silakan Logout lalu login lagi sebagai admin.');
            return;
          }

          const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
          const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';
          if (!supabaseUrl || !supabaseAnonKey) {
            setDataError('Konfigurasi Supabase belum siap (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
            return;
          }

          const payload = {
            email: email.trim(),
            password,
            display_name: displayName.trim() ? displayName.trim() : null,
            role: accountRole,
            wali_kelas: accountRole === 'walikelas' ? waliKelas : null,
          };

          const resp = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
          });

          const rawText = await resp.text();
          const parsed = (() => {
            try {
              return rawText ? JSON.parse(rawText) : null;
            } catch {
              return null;
            }
          })();

          if (!resp.ok) {
            const status = `HTTP ${resp.status}`;
            const detail =
              parsed && typeof parsed === 'object'
                ? JSON.stringify(parsed)
                : rawText
                  ? rawText
                  : '(empty body)';
            setDataError([`Edge Function error`, status, detail].filter(Boolean).join(' - '));
            return;
          }

          const data = parsed as any;
          if (!data?.ok) {
            setDataError(data?.error ?? 'Gagal membuat akun.');
            return;
          }

          const label = accountRole === 'admin' ? 'Akun admin dibuat' : accountRole === 'walikelas' ? 'Akun wali kelas dibuat' : 'Akun guru dibuat';
          setResult(`${label}: ${data.user?.email ?? email.trim()}`);
          setEmail('');
          setPassword('');
          setDisplayName('');
          setAccountRole('guru');
          setWaliKelas(CLASSES[0] ?? 'X-A');
          await props.reloadProfile?.();
          await propsCard?.onCreated?.();
        } finally {
          setBusy(false);
        }
      })();
    };

    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h4 className="font-bold text-slate-800 mb-1">Tambah Akun</h4>
        <p className="text-sm text-slate-500 mb-4">Buat akun login (email + password) untuk Guru atau Wali Kelas.</p>
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            className="border rounded-lg p-2"
            value={accountRole}
            onChange={(e) => setAccountRole(e.target.value as 'admin' | 'guru' | 'walikelas')}
          >
            <option value="admin">Admin</option>
            <option value="guru">Guru</option>
            <option value="walikelas">Wali Kelas</option>
          </select>
          <input
            className="border rounded-lg p-2"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="border rounded-lg p-2"
            placeholder="Password (min 6)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
          />
          {accountRole === 'walikelas' && (
            <select
              className="border rounded-lg p-2"
              value={waliKelas}
              onChange={(e) => setWaliKelas(e.target.value)}
            >
              {CLASSES.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          )}
          <input
            className="border rounded-lg p-2"
            placeholder={
              accountRole === 'admin'
                ? 'Nama admin (opsional)'
                : accountRole === 'walikelas'
                  ? 'Nama wali kelas (opsional)'
                  : 'Nama guru (opsional)'
            }
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <div className="md:col-span-3 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-400">Catatan: fitur ini butuh Supabase Edge Function `create-user`.</div>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? 'Membuat...' : 'Buat Akun'}
            </button>
          </div>
        </form>
        {result && (
          <div className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg">{result}</div>
        )}
      </div>
    );
  };

  const DashboardView = () => {
    const allTasks = students.flatMap((s) => s.tasks.map((t) => ({ student: s, task: t })));
    const byTeacher = new Map<string, { teacherId: string; total: number; open: number; done: number }>();

    allTasks.forEach(({ task }) => {
      const teacherId = task.createdBy ?? 'unknown';
      const row = byTeacher.get(teacherId) ?? { teacherId, total: 0, open: 0, done: 0 };
      row.total += 1;
      if (task.isDone) row.done += 1;
      else row.open += 1;
      byTeacher.set(teacherId, row);
    });

    const teacherRows = Array.from(byTeacher.values())
      .filter((r) => r.teacherId !== 'unknown')
      .sort((a, b) => b.open - a.open);

    return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
              <Users size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Siswa (Semua Tingkat)</p>
              <h3 className="text-2xl font-bold text-slate-800">{students.length}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-100 rounded-lg text-red-600">
              <FileWarning size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Rapor Ditahan</p>
              <h3 className="text-2xl font-bold text-slate-800">{totalDitahan}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg text-green-600">
              <CheckCircle size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Siap Bagi Rapor</p>
              <h3 className="text-2xl font-bold text-slate-800">{totalAman}</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
        <h4 className="font-bold text-blue-800 mb-1">Info Akademik Kurikulum Madrasah</h4>
        <p className="text-sm text-blue-700">
          Daftar mata pelajaran telah disesuaikan dengan struktur KMA terbaru untuk jenjang MA (Umum, PAI & Bahasa
          Arab, serta Mapel Pilihan). Gunakan sistem ini untuk memastikan ketuntasan kompetensi sebelum pembagian
          rapor fisik.
        </p>
      </div>

      {props.role === 'admin' && teacherRows.length > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h4 className="font-bold text-slate-800 mb-4">Rekap Pengawasan (per Guru)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-4">Guru</th>
                  <th className="py-2 pr-4">Belum Tuntas</th>
                  <th className="py-2 pr-4">Tuntas</th>
                  <th className="py-2 pr-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {teacherRows.map((r) => (
                  <tr key={r.teacherId} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-slate-800 font-medium">
                      {teacherNamesById[r.teacherId] ?? `User ${r.teacherId.slice(0, 8)}`}
                    </td>
                    <td className="py-2 pr-4 text-red-700">{r.open}</td>
                    <td className="py-2 pr-4 text-green-700">{r.done}</td>
                    <td className="py-2 pr-4 text-slate-700">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">Sumber: tasks.created_by (guru yang input ketuntasan).</p>
        </div>
      )}
    </div>
    )
  };

  const TeachersView = () => {
    type TeacherProfile = {
      id: string;
      display_name: string | null;
      email: string | null;
      role: 'guru' | 'walikelas' | 'admin' | string;
      wali_kelas: string | null;
    };
    type SubjectRow = { id: string; name: string };
    type ClassRow = { name: string };

    const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
    const [subjects, setSubjects] = useState<SubjectRow[]>([]);
    const [classes, setClasses] = useState<ClassRow[]>([]);
    const [teacherId, setTeacherId] = useState('');
    const [subjectId, setSubjectId] = useState('');
    const [className, setClassName] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);

    const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
    const [editEmail, setEditEmail] = useState<string>('');
    const [editDisplayName, setEditDisplayName] = useState<string>('');
    const [editPassword, setEditPassword] = useState<string>('');
    const [savingTeacher, setSavingTeacher] = useState(false);

    const loadAdminTeacherData = async () => {
      setLocalError(null);
      const [{ data: tData, error: tErr }, { data: sData, error: sErr }, { data: cData, error: cErr }] =
        await Promise.all([
          sb
            .from('profiles')
            .select('id,display_name,email,role,wali_kelas')
            .in('role', ['guru', 'walikelas'])
            .order('role', { ascending: true })
            .order('display_name', { ascending: true }),
          sb.from('subjects').select('id,name').order('group_name', { ascending: true }).order('name', { ascending: true }),
          sb.from('classes').select('name').order('name', { ascending: true }),
        ]);

      if (tErr || sErr || cErr) {
        setLocalError((tErr ?? sErr ?? cErr)?.message ?? 'Gagal memuat data guru/mapel/kelas.');
        setTeachers([]);
        setSubjects([]);
        setClasses([]);
        return;
      }

      setTeachers((tData as TeacherProfile[] | null) ?? []);
      setSubjects((sData as SubjectRow[] | null) ?? []);
      setClasses((cData as ClassRow[] | null) ?? []);

      if (!className) {
        const firstClass = ((cData as ClassRow[] | null) ?? [])[0]?.name;
        if (firstClass) setClassName(firstClass);
      }
    };

    useEffect(() => {
      if (props.role !== 'admin') return;
      void (async () => {
        await loadAdminTeacherData();
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (props.role !== 'admin') {
      return (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
          Menu ini hanya untuk admin.
        </div>
      );
    }

    const onAssign = (e: React.FormEvent) => {
      e.preventDefault();
      void (async () => {
        setDataError(null);
        setLocalError(null);
        setResult(null);
        setBusy(true);
        try {
          const { error } = await sb.from('teacher_assignments').insert({
            teacher_id: teacherId,
            subject_id: subjectId,
            class_name: className,
            term_id: null,
          });
          if (error) {
            setLocalError(error.message);
            return;
          }
          setResult('Penugasan tersimpan. Guru bisa refresh untuk melihat mapel/kelas ajar.');
          setTeacherId('');
          setSubjectId('');
        } finally {
          setBusy(false);
        }
      })();
    };

    return (
      <div className="space-y-6 animate-fade-in">
        <AdminCreateTeacherCard onCreated={loadAdminTeacherData} />

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h4 className="font-bold text-slate-800 mb-1">Daftar Akun Guru / Wali Kelas</h4>
          <p className="text-sm text-slate-500 mb-4">Menampilkan akun guru & wali kelas yang sudah dibuat. Admin bisa edit data atau reset password.</p>

          {localError && (
            <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">{localError}</div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-4">Nama</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {teachers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-3 text-slate-500">Belum ada akun guru.</td>
                  </tr>
                ) : (
                  teachers.map((t) => {
                    const isEditing = editingTeacherId === t.id;
                    return (
                      <tr key={t.id} className="border-b last:border-0 align-top">
                        <td className="py-2 pr-4 text-slate-800 font-medium">
                          {isEditing ? (
                            <input
                              className="border rounded-lg p-2 w-full min-w-[220px]"
                              value={editDisplayName}
                              onChange={(e) => setEditDisplayName(e.target.value)}
                              placeholder="Nama guru"
                            />
                          ) : (
                            <div className="space-y-0.5">
                              <div>{t.display_name?.trim() ? t.display_name.trim() : `User ${t.id.slice(0, 8)}`}</div>
                              {t.role === 'walikelas' && (
                                <div className="text-xs text-slate-500">Wali Kelas {t.wali_kelas ?? '-'}</div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-slate-700">
                          {isEditing ? (
                            <input
                              className="border rounded-lg p-2 w-full min-w-[240px]"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              placeholder="Email guru"
                              type="email"
                            />
                          ) : (
                            (t.email?.trim() ? t.email.trim() : '-')
                          )}

                          {isEditing && (
                            <div className="mt-2">
                              <input
                                className="border rounded-lg p-2 w-full"
                                value={editPassword}
                                onChange={(e) => setEditPassword(e.target.value)}
                                placeholder="Password baru (opsional, min 6)"
                                type="password"
                              />
                              <div className="text-xs text-slate-400 mt-1">Isi password untuk reset ulang.</div>
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={savingTeacher}
                                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                                onClick={() => {
                                  void (async () => {
                                    setDataError(null);
                                    setLocalError(null);
                                    setResult(null);
                                    setSavingTeacher(true);
                                    try {
                                      const { data: sessionData } = await sb.auth.getSession();
                                      const token = sessionData.session?.access_token;
                                      if (!token) {
                                        setLocalError('Session login tidak ditemukan. Logout lalu login lagi sebagai admin.');
                                        return;
                                      }

                                      const body: any = {
                                        user_id: t.id,
                                      };

                                      if (editEmail.trim()) body.email = editEmail.trim();
                                      if (editDisplayName.trim()) body.display_name = editDisplayName.trim();
                                      if (editPassword.trim()) body.password = editPassword;

                                      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
                                      const supabaseAnonKey =
                                        (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';
                                      if (!supabaseUrl || !supabaseAnonKey) {
                                        setLocalError('Konfigurasi Supabase belum siap (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
                                        return;
                                      }

                                      const resp = await fetch(`${supabaseUrl}/functions/v1/update-user`, {
                                        method: 'POST',
                                        headers: {
                                          'Content-Type': 'application/json',
                                          apikey: supabaseAnonKey,
                                          Authorization: `Bearer ${token}`,
                                        },
                                        body: JSON.stringify(body),
                                      });

                                      const rawText = await resp.text();
                                      const parsed = (() => {
                                        try {
                                          return rawText ? JSON.parse(rawText) : null;
                                        } catch {
                                          return null;
                                        }
                                      })();

                                      if (!resp.ok) {
                                        const status = `HTTP ${resp.status}`;
                                        const detail =
                                          parsed && typeof parsed === 'object'
                                            ? JSON.stringify(parsed)
                                            : rawText
                                              ? rawText
                                              : '(empty body)';
                                        setLocalError([`Edge Function error`, status, detail].filter(Boolean).join(' - '));
                                        return;
                                      }

                                      setResult('Data guru tersimpan.');
                                      setEditingTeacherId(null);
                                      setEditPassword('');
                                      await loadAdminTeacherData();
                                    } finally {
                                      setSavingTeacher(false);
                                    }
                                  })();
                                }}
                              >
                                {savingTeacher ? 'Menyimpan...' : 'Simpan'}
                              </button>
                              <button
                                type="button"
                                disabled={savingTeacher}
                                className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-60"
                                onClick={() => {
                                  setEditingTeacherId(null);
                                  setEditPassword('');
                                }}
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                              onClick={() => {
                                setEditingTeacherId(t.id);
                                setEditEmail(t.email?.trim() ? t.email.trim() : '');
                                setEditDisplayName(t.display_name?.trim() ? t.display_name.trim() : '');
                                setEditPassword('');
                              }}
                            >
                              Edit / Reset
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {result && (
            <div className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg">{result}</div>
          )}
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h4 className="font-bold text-slate-800 mb-1">Penugasan Guru (Mapel & Kelas)</h4>
          <p className="text-sm text-slate-500 mb-4">
            Isi penugasan agar guru hanya bisa input/lihat data pada kelas yang diajar.
          </p>

          {localError && (
            <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">{localError}</div>
          )}
          {result && (
            <div className="mb-3 text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg">{result}</div>
          )}

          <form onSubmit={onAssign} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select className="border rounded-lg p-2" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
              <option value="">Pilih Guru</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.display_name?.trim() ? t.display_name.trim() : `User ${t.id.slice(0, 8)}`}
                </option>
              ))}
            </select>

            <select className="border rounded-lg p-2" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
              <option value="">Pilih Mapel</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select className="border rounded-lg p-2" value={className} onChange={(e) => setClassName(e.target.value)} required>
              <option value="">Pilih Kelas</option>
              {(classes.length ? classes.map((c) => c.name) : CLASSES).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <div className="md:col-span-3 flex items-center justify-end">
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-60"
              >
                {busy ? 'Menyimpan...' : 'Simpan Penugasan'}
              </button>
            </div>
          </form>

          <p className="text-xs text-slate-400 mt-3">
            Jika dropdown mapel/kelas kosong atau error, pastikan kamu sudah menjalankan schema terbaru di Supabase (file schema.sql).
          </p>
        </div>
      </div>
    );
  };

  const GuruView = () => {
    const [searchTerm, setSearchTerm] = useState('');

    const allMapelFallback = Array.from(new Set(Object.values(SUBJECTS).flat())).sort((a, b) => a.localeCompare(b));
    const allMapel = props.role === 'guru' && guruMapelAjar.length > 0 ? guruMapelAjar : allMapelFallback;

    const visibleStudents =
      props.role === 'guru'
        ? guruKelasAjar.length > 0
          ? students.filter((s) => guruKelasAjar.includes(s.kelas))
          : []
        : students;

    const filteredStudents = visibleStudents
      .filter((s) => (guruKelasFilter ? s.kelas === guruKelasFilter : true))
      .filter(
        (s) =>
          s.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.kelas.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.nis.includes(searchTerm),
      )
      .filter((s) => {
        if (!guruOnlyProblematic) return true;
        const relevant = guruMapelFilter ? s.tasks.filter((t) => t.mapel === guruMapelFilter) : s.tasks;
        return relevant.some((t) => !t.isDone);
      });

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Panel Guru Mata Pelajaran</h2>
            <p className="text-sm text-slate-500">Pilih mapel, lalu cek siswa yang belum tuntas (kelas yang diajar)</p>
          </div>
          <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
            <select
              className="w-full md:w-56 border rounded-lg p-2"
              value={guruMapelFilter}
              onChange={(e) => setGuruMapelFilter(e.target.value)}
              title="Pilih mapel yang diajar"
            >
              <option value="">Semua Mapel</option>
              {allMapel.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <select
              className="w-full md:w-40 border rounded-lg p-2 disabled:bg-slate-50 disabled:text-slate-500"
              value={guruKelasFilter}
              onChange={(e) => setGuruKelasFilter(e.target.value)}
              disabled={props.role === 'guru' && guruKelasAjar.length === 0}
              title="Filter kelas"
            >
              <option value="">Semua Kelas</option>
              {(props.role === 'guru' ? guruKelasAjar : CLASSES).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm text-slate-700 bg-white">
              <input
                type="checkbox"
                checked={guruOnlyProblematic}
                onChange={(e) => setGuruOnlyProblematic(e.target.checked)}
              />
              Hanya Bermasalah
            </label>

            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Cari Nama / Kelas / NIS..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {props.role === 'guru' && guruKelasAjar.length === 0 ? (
            <div className="p-8 text-center text-slate-600">
              Kelas ajar belum di-set. Admin perlu mengisi <span className="font-mono">teacher_assignments</span> untuk akun ini.
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-8 text-center text-slate-500">Data siswa tidak ditemukan.</div>
          ) : (
            filteredStudents.map((student) => (
              <div key={student.id} className="border-b last:border-0 p-4 hover:bg-slate-50">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                      {student.kelas.split('-')[0]}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-800">
                        {student.nama}{' '}
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-xs text-slate-600 font-normal">
                          {student.kelas}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-400">NIS: {student.nis}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedStudent(student);
                      setShowTaskModal(true);
                    }}
                    className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-200 flex items-center gap-1"
                  >
                    <Plus size={16} /> Tambah Tagihan
                  </button>
                </div>

                {(() => {
                  const relevantTasks = guruMapelFilter ? student.tasks.filter((t) => t.mapel === guruMapelFilter) : student.tasks;
                  if (relevantTasks.length === 0) {
                    return (
                      <p className="text-sm text-slate-400 italic ml-14">
                        {guruMapelFilter ? 'Tidak ada tanggungan untuk mapel ini.' : 'Tidak ada tanggungan remedial.'}
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-2 ml-14">
                      {relevantTasks.map((task) => (
                      <div
                        key={task.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          task.isDone ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleTaskStatus(student.id, task.id)}
                            className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors ${
                              task.isDone ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-slate-300'
                            }`}
                            title={task.isDone ? 'Tandai Belum Selesai' : 'Tandai Selesai'}
                          >
                            {task.isDone && <CheckCircle size={14} />}
                          </button>
                          <div>
                            <p
                              className={`font-medium ${
                                task.isDone ? 'text-green-800 line-through' : 'text-red-800'
                              }`}
                            >
                              {task.mapel}
                            </p>
                            <p className={`text-sm ${task.isDone ? 'text-green-600' : 'text-red-600'}`}>
                              {task.deskripsi}
                            </p>
                            {(task.dueDate || task.treatmentNote) && (
                              <div className={`mt-1 text-xs ${task.isDone ? 'text-green-600' : 'text-red-600'}`}>
                                {task.dueDate && <span className="mr-2">Target: {task.dueDate}</span>}
                                {task.treatmentNote && <span>Catatan: {task.treatmentNote}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteTask(student.id, task.id)}
                          className="text-slate-400 hover:text-red-500 p-1"
                          title="Hapus Tagihan"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const WaliKelasView = () => {
    // Filter siswa berdasarkan kelas yang dipilih wali kelas
    const classStudents = students.filter((s) => s.kelas === waliKelasFilter);
    const classDitahan = classStudents.filter((s) => getStatus(s) === 'DITAHAN').length;
    const classAman = classStudents.filter((s) => getStatus(s) === 'AMAN').length;

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Panel Wali Kelas</h2>
            <p className="text-sm text-slate-500">Monitoring ketuntasan per rombel</p>
          </div>

          <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm">
            <School size={20} className="text-slate-500 ml-2" />
            <select
              value={waliKelasFilter}
              onChange={(e) => setWaliKelasFilter(e.target.value)}
              disabled={isWaliKelasLocked}
              className="bg-transparent border-none outline-none text-slate-700 font-semibold cursor-pointer min-w-[150px] disabled:cursor-not-allowed"
            >
              {(isWaliKelasLocked && props.waliKelas ? [props.waliKelas] : CLASSES).map((cls) => (
                <option key={cls} value={cls}>
                  Kelas {cls}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Statistik Kecil per Kelas */}
        <div className="flex gap-4 mb-4">
          <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
            <AlertTriangle size={16} /> Ditahan: {classDitahan}
          </div>
          <div className="bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
            <CheckCircle size={16} /> Aman: {classAman}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {classStudents.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-400 mb-2">Belum ada data siswa untuk kelas {waliKelasFilter}</p>
              <p className="text-xs text-slate-400">Silakan tambahkan data siswa atau pilih kelas lain.</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="p-4 font-semibold text-slate-600">Nama Siswa</th>
                  <th className="p-4 font-semibold text-slate-600">NIS</th>
                  <th className="p-4 font-semibold text-slate-600">Status Rapor</th>
                  <th className="p-4 font-semibold text-slate-600">Detail Hutang</th>
                  <th className="p-4 font-semibold text-slate-600 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {classStudents.map((student) => {
                  const status = getStatus(student);
                  const pendingTasks = student.tasks.filter((t) => !t.isDone);
                  return (
                    <tr key={student.id} className="hover:bg-slate-50">
                      <td className="p-4 font-medium text-slate-800">{student.nama}</td>
                      <td className="p-4 text-slate-500 text-sm">{student.nis}</td>
                      <td className="p-4">
                        {status === 'DITAHAN' ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                            <AlertTriangle size={12} /> DITAHAN
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                            <CheckCircle size={12} /> BOLEH DIAMBIL
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        {pendingTasks.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {pendingTasks.map((t) => (
                              <span
                                key={t.id}
                                className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-100 w-fit"
                              >
                                {t.mapel}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">-</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        {status === 'DITAHAN' && (
                          <button
                            onClick={() => {
                              setSelectedStudent(student);
                              setShowPrintModal(true);
                            }}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white text-sm rounded-lg hover:bg-slate-700 transition-colors"
                          >
                            <Printer size={16} /> Surat
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  const StudentsAdminView = () => {
    const [searchTerm, setSearchTerm] = useState('');

    const visibleStudents =
      props.role === 'guru'
        ? guruKelasAjar.length > 0
          ? students.filter((s) => guruKelasAjar.includes(s.kelas))
          : []
        : students;

    const filteredStudents = visibleStudents.filter(
      (s) =>
        s.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.kelas.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.nis.includes(searchTerm),
    );

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Data Siswa</h2>
            {props.role === 'walikelas' ? (
              <p className="text-sm text-slate-500">Tambah / edit data siswa untuk kelas {props.waliKelas ?? '-'}</p>
            ) : props.role === 'guru' ? (
              <p className="text-sm text-slate-500">
                Tambah / edit data siswa untuk kelas yang diajar{guruKelasAjar.length > 0 ? `: ${guruKelasAjar.join(', ')}` : ''}
              </p>
            ) : (
              <p className="text-sm text-slate-500">Tambah / edit / hapus data siswa (admin)</p>
            )}
          </div>
          <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Cari Nama / Kelas / NIS..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowImportStudentsModal(true)}
              className="px-3 py-2 border rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-2 whitespace-nowrap"
              title="Import siswa massal dari CSV"
            >
              <FileText size={16} /> Import CSV
            </button>
            <button
              onClick={() => {
                setEditingStudentId(null);
                setShowStudentModal(true);
              }}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 whitespace-nowrap"
            >
              <Plus size={16} /> Tambah Siswa
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {filteredStudents.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-500 mb-2">Belum ada data siswa.</p>
              <p className="text-xs text-slate-400">Klik “Tambah Siswa” untuk mulai mengisi data.</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="p-4 font-semibold text-slate-600">Nama</th>
                  <th className="p-4 font-semibold text-slate-600">Kelas</th>
                  <th className="p-4 font-semibold text-slate-600">NIS</th>
                  <th className="p-4 font-semibold text-slate-600">Ortu</th>
                  <th className="p-4 font-semibold text-slate-600 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredStudents.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="p-4 font-medium text-slate-800">{s.nama}</td>
                    <td className="p-4 text-slate-700 text-sm">{s.kelas}</td>
                    <td className="p-4 text-slate-700 text-sm">{s.nis}</td>
                    <td className="p-4 text-slate-700 text-sm">{s.ortu || '-'}</td>
                    <td className="p-4 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => {
                            setEditingStudentId(s.id);
                            setShowStudentModal(true);
                          }}
                          className="px-3 py-1.5 border rounded-lg text-sm hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        {props.role === 'admin' && (
                          <button
                            onClick={() => void deleteStudent(s.id)}
                            className="px-3 py-1.5 border border-red-200 text-red-700 bg-red-50 rounded-lg text-sm hover:bg-red-100"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  // --- Modals ---

  const AddTaskModal = () => {
    const [mapel, setMapel] = useState('');
    const [deskripsi, setDeskripsi] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [treatmentNote, setTreatmentNote] = useState('');

    if (!showTaskModal || !selectedStudent) return null;

    useEffect(() => {
      if (props.role === 'guru') {
        setMapel(guruMapelFilter || '');
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showTaskModal]);

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (mapel && deskripsi) {
        addTask(selectedStudent.id, mapel, deskripsi, dueDate || null, treatmentNote.trim() || null);
        setMapel('');
        setDeskripsi('');
        setDueDate('');
        setTreatmentNote('');
        setShowTaskModal(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
          <h3 className="text-lg font-bold mb-4">Tambah Tagihan Remedial</h3>
          <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
            Siswa: <strong>{selectedStudent.nama}</strong> ({selectedStudent.kelas})
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mata Pelajaran (Kurikulum MA)</label>
              <select
                className="w-full border rounded-lg p-2"
                value={mapel}
                onChange={(e) => setMapel(e.target.value)}
                required
              >
                <option value="">-- Pilih Mapel --</option>
                <optgroup label="Kelompok PAI & Bahasa Arab">
                  {SUBJECTS.PAI.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Kelompok Umum">
                  {SUBJECTS.Umum.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Mapel Pilihan (MIPA/IPS/BHS)">
                  {SUBJECTS.PilihanMIPA_IPS_BHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Mapel Pilihan Keagamaan">
                  {SUBJECTS.PilihanKeagamaan.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Lainnya">
                  {SUBJECTS.MuatanLokal.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi Tugas/Kompetensi</label>
              <textarea
                className="w-full border rounded-lg p-2"
                rows={3}
                placeholder="Contoh: Mengerjakan 5 soal esai bab Statistik"
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target Selesai (Opsional)</label>
              <input
                className="w-full border rounded-lg p-2"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Catatan Treatment/Remedial (Opsional)</label>
              <textarea
                className="w-full border rounded-lg p-2"
                rows={3}
                placeholder="Contoh: Remedial 2x pertemuan, bimbingan setelah jam pelajaran"
                value={treatmentNote}
                onChange={(e) => setTreatmentNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={() => setShowTaskModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Simpan
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const StudentModal = () => {
    const editing = editingStudentId ? students.find((s) => s.id === editingStudentId) ?? null : null;
    const [nama, setNama] = useState(editing?.nama ?? '');
    const [kelas, setKelas] = useState(
      editing?.kelas ?? (props.role === 'guru' ? (guruKelasAjar[0] ?? 'X-A') : (props.waliKelas ?? 'X-A')),
    );
    const [nis, setNis] = useState(editing?.nis ?? '');
    const [ortu, setOrtu] = useState(editing?.ortu ?? '');
    const [saving, setSaving] = useState(false);

    const isKelasLocked = props.role === 'walikelas' && !!props.waliKelas;
    const isGuru = props.role === 'guru';
    const noGuruAssignments = isGuru && guruKelasAjar.length === 0;
    const allowedKelasOptions = isKelasLocked && props.waliKelas ? [props.waliKelas] : isGuru ? (noGuruAssignments ? CLASSES : guruKelasAjar) : CLASSES;
    const effectiveKelas = isKelasLocked && props.waliKelas ? props.waliKelas : kelas;

    useEffect(() => {
      setNama(editing?.nama ?? '');
      setKelas(
        editing?.kelas ??
          (props.role === 'guru'
            ? guruKelasAjar[0] ?? 'X-A'
            : props.waliKelas ?? 'X-A'),
      );
      setNis(editing?.nis ?? '');
      setOrtu(editing?.ortu ?? '');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingStudentId, props.role, props.waliKelas, guruKelasAjar.join('|')]);

    if (!showStudentModal) return null;

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      void (async () => {
        setSaving(true);
        await upsertStudent({
          nama: nama.trim(),
          kelas: effectiveKelas,
          nis: nis.trim(),
          ortu: ortu.trim() ? ortu.trim() : null,
        });
        setSaving(false);
      })();
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">{editing ? 'Edit Siswa' : 'Tambah Siswa'}</h3>
            <button
              onClick={() => {
                setShowStudentModal(false);
                setEditingStudentId(null);
              }}
              className="text-slate-400 hover:text-slate-600"
              title="Tutup"
            >
              <XCircle size={22} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nama Siswa</label>
              <input
                className="w-full border rounded-lg p-2"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kelas</label>
              <select
                className="w-full border rounded-lg p-2 disabled:bg-slate-50 disabled:text-slate-500"
                value={effectiveKelas}
                onChange={(e) => setKelas(e.target.value)}
                disabled={isKelasLocked || noGuruAssignments}
              >
                {allowedKelasOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {isKelasLocked && (
                <p className="text-xs text-slate-400 mt-1">Kelas dikunci sesuai wali kelas.</p>
              )}
              {noGuruAssignments && (
                <p className="text-xs text-red-600 mt-1">Kelas ajar belum di-set. Hubungi admin untuk mengisi teacher_assignments.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">NIS</label>
              <input
                className="w-full border rounded-lg p-2"
                value={nis}
                onChange={(e) => setNis(e.target.value)}
                required
              />
              <p className="text-xs text-slate-400 mt-1">NIS harus unik (tidak boleh sama).</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nama Ortu (opsional)</label>
              <input className="w-full border rounded-lg p-2" value={ortu} onChange={(e) => setOrtu(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowStudentModal(false);
                  setEditingStudentId(null);
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const ImportStudentsModal = () => {
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    if (!showImportStudentsModal) return null;

    const downloadTemplate = () => {
      const template = 'nama,kelas,nis,ortu\n"Ahmad Fauzan","X-A","10001","Bpk/Ibu ..."\n';
      const blob = new Blob([template], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'students_template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const onImport = () => {
      void (async () => {
        setDataError(null);
        setResult(null);

        if (!canManageStudents) {
          setDataError('Akses ditolak: hanya admin/guru/wali kelas yang bisa mengelola data siswa.');
          return;
        }

        if (props.role === 'walikelas' && !props.waliKelas) {
          setDataError('Akun wali kelas belum punya kelas. Set dulu profiles.wali_kelas (contoh: X-A).');
          return;
        }

        if (props.role === 'guru' && guruKelasAjar.length === 0) {
          setDataError('Kelas ajar belum di-set. Admin perlu mengisi teacher_assignments untuk akun guru ini.');
          return;
        }

        if (!file) {
          setDataError('Pilih file CSV terlebih dahulu.');
          return;
        }

        setBusy(true);
        try {
          const text = await file.text();
          const rows = parseCsv(text);

          if (rows.length === 0) {
            setDataError('CSV kosong atau format tidak terbaca. Pastikan ada header: nama,kelas,nis,ortu');
            return;
          }

          const required = ['nama', 'kelas', 'nis'];
          const first = rows[0];
          const missing = required.filter((k) => !(k in first));
          if (missing.length > 0) {
            setDataError(`Header CSV kurang: ${missing.join(', ')}. Header wajib: nama,kelas,nis,ortu`);
            return;
          }

          const errors: string[] = [];
          const payload = rows
            .map((r, idx) => {
              const nama = (r.nama ?? '').trim();
              const nis = (r.nis ?? '').trim();
              const ortu = (r.ortu ?? '').trim();
              const kelasRaw = (r.kelas ?? '').trim();
              const kelas = props.role === 'walikelas' ? (props.waliKelas as string) : kelasRaw;

              if (!nama || !nis) {
                errors.push(`Baris ${idx + 2}: nama/nis wajib diisi.`);
                return null;
              }
              if (!kelas) {
                errors.push(`Baris ${idx + 2}: kelas wajib diisi.`);
                return null;
              }
              if (props.role !== 'walikelas' && !CLASSES.includes(kelas)) {
                errors.push(`Baris ${idx + 2}: kelas tidak valid (${kelas}). Contoh: X-A, XI-A, XII-A.`);
                return null;
              }

              if (props.role === 'guru' && !guruKelasAjar.includes(kelas)) {
                errors.push(
                  `Baris ${idx + 2}: guru hanya boleh import untuk kelas yang dia ajar (${guruKelasAjar.join(', ')}).`,
                );
                return null;
              }

              return {
                nama,
                kelas,
                nis,
                ortu: ortu ? ortu : null,
              };
            })
            .filter((x): x is { nama: string; kelas: string; nis: string; ortu: string | null } => x !== null);

          if (errors.length > 0) {
            setDataError(errors.slice(0, 5).join(' '));
            return;
          }

          if (payload.length === 0) {
            setDataError('Tidak ada baris valid untuk diimport.');
            return;
          }

          // Upsert by NIS: jika sudah ada, akan diperbarui (lebih aman untuk re-import)
          const { error } = await sb.from('students').upsert(payload, { onConflict: 'nis' });
          if (error) {
            setDataError(error.message);
            return;
          }

          setResult(`Berhasil import: ${payload.length} siswa.`);
          await refreshData();
        } finally {
          setBusy(false);
        }
      })();
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Import Siswa (CSV)</h3>
            <button
              onClick={() => setShowImportStudentsModal(false)}
              className="text-slate-400 hover:text-slate-600"
              title="Tutup"
            >
              <XCircle size={22} />
            </button>
          </div>

          <div className="text-sm text-slate-600 space-y-2 mb-4">
            <p>Format header CSV: <span className="font-mono">nama,kelas,nis,ortu</span>.</p>
            {props.role === 'walikelas' && props.waliKelas && (
              <p>
                Role wali kelas: kolom <span className="font-mono">kelas</span> akan dikunci otomatis menjadi{' '}
                <span className="font-semibold">{props.waliKelas}</span>.
              </p>
            )}
            {props.role === 'guru' && (
              <p>
                Role guru: kolom <span className="font-mono">kelas</span> harus termasuk kelas yang diajar
                {guruKelasAjar.length > 0 ? ` (${guruKelasAjar.join(', ')})` : ''}.
              </p>
            )}
            <button onClick={downloadTemplate} className="text-blue-700 hover:underline text-sm">
              Unduh template CSV
            </button>
          </div>

          <div className="space-y-3">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {result && <div className="text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg">{result}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowImportStudentsModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onImport}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? 'Mengimport...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const PrintPreviewModal = () => {
    if (!showPrintModal || !selectedStudent) return null;

    const pendingTasks = selectedStudent.tasks.filter((t) => !t.isDone);

    // Fungsi untuk membuat file Word
    const handleDownloadWord = () => {
      const headerContent = `
        <div style="text-align: center; border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 20px;">
          <h3 style="margin: 0; font-size: 12pt;">KEMENTERIAN AGAMA REPUBLIK INDONESIA</h3>
          <h3 style="margin: 3px 0 0; font-size: 12pt;">KANTOR KEMENTERIAN AGAMA KABUPATEN BANGGAI</h3>
          <h2 style="margin: 4px 0; font-size: 16pt;">MADRASAH ALIYAH NEGERI (MAN) BANGGAI</h2>
          <p style="margin: 0; font-size: 9.5pt;">JL. Pulau Irian Rt.004 / Rw.006  Kel Kompo Kec. Luwuk Selatan 94717 NPSN 40209818 NSM 131172010001</p>
          <p style="margin: 2px 0 0; font-size: 9.5pt;">Website : https://man1banggai.sch.id /email :luwuk_man@yahoo.com</p>
        </div>
      `;

      const bodyContent = `
        <h3 style="text-align: center; text-decoration: underline; margin: 0;">SURAT PERNYATAAN KOMITMEN AKADEMIK</h3>
        <br/>
        <p style="margin-top: 0;">Saya yang bertanda tangan di bawah ini:</p>
        <table style="width: 100%; border: none;">
          <tr><td style="width: 150px;">Nama Siswa</td><td>: ${selectedStudent.nama}</td></tr>
          <tr><td>Kelas</td><td>: ${selectedStudent.kelas}</td></tr>
          <tr><td>NIS</td><td>: ${selectedStudent.nis}</td></tr>
          <tr><td>Nama Orang Tua</td><td>: ${selectedStudent.ortu || '-'}</td></tr>
        </table>

        <p style="text-align: justify;">
          Dengan ini menyatakan mengetahui bahwa nilai <strong>Rapor Digital Madrasah (RDM)</strong> Semester ini telah diisi sesuai standar <strong>Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)</strong>. Namun, berdasarkan fakta akademik, siswa tersebut masih memiliki belum tuntas pada mata pelajaran berikut:
        </p>

        <table style="width: 100%; border-collapse: collapse; border: 1px solid black;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid black; padding: 8px; width: 40px; text-align: center;">No</th>
              <th style="border: 1px solid black; padding: 8px;">Mata Pelajaran</th>
              <th style="border: 1px solid black; padding: 8px;">Deskripsi Kekurangan/Kompetensi</th>
            </tr>
          </thead>
          <tbody>
            ${pendingTasks
              .map(
                (t, idx) => `
              <tr>
                <td style="border: 1px solid black; padding: 8px; text-align: center;">${idx + 1}</td>
                <td style="border: 1px solid black; padding: 8px;">${t.mapel}</td>
                <td style="border: 1px solid black; padding: 8px;">${t.deskripsi}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>

        <p style="text-align: justify;">
          Kami berkomitmen untuk menuntaskan kekurangan tersebut sesuai jadwal remedial yang ditetapkan. Kami bersedia apabila <strong>Rapor Fisik Asli ditahan sementara</strong> oleh pihak Madrasah sebagai jaminan hingga seluruh kompetensi dinyatakan tuntas.
        </p>

        <br/><br/>
        <table style="width: 100%; border: none;">
          <tr>
            <td style="text-align: center; vertical-align: top;">
              <p>Mengetahui,</p>
              <p>Orang Tua/Wali</p>
              <br/><br/><br/><br/>
              <p><strong>(${selectedStudent.ortu || '-'})</strong></p>
            </td>
            <td style="text-align: center; vertical-align: top;">
              <p>Banggai, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <p>Siswa</p>
              <br/><br/><br/><br/>
              <p><strong>(${selectedStudent.nama})</strong></p>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="text-align: center; padding-top: 30px;">
               <p>Menyetujui,</p>
               <p>Wali Kelas ${selectedStudent.kelas}</p>
               <br/><br/><br/><br/>
               <p>.............................</p>
            </td>
          </tr>
        </table>
      `;

      const fullHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>Surat Pernyataan - ${selectedStudent.nama}</title></head>
        <body style="font-family: 'Times New Roman', serif;">
          ${headerContent}
          ${bodyContent}
        </body>
        </html>
      `;

      const blob = new Blob(['\ufeff', fullHtml], {
        type: 'application/msword',
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Surat_Pernyataan_${selectedStudent.nama.replace(/\s+/g, '_')}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full my-8 flex flex-col max-h-[90vh]">
          {/* Modal Header */}
          <div className="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-xl">
            <h3 className="font-bold text-slate-800">Pratinjau Dokumen</h3>
            <button onClick={() => setShowPrintModal(false)} className="text-slate-400 hover:text-slate-600">
              <XCircle size={24} />
            </button>
          </div>

          {/* Document Content (Scrollable Preview) */}
          <div className="p-8 overflow-y-auto bg-white font-serif text-sm leading-relaxed border-b">
            <div className="text-center mb-6 border-b-2 border-black pb-4">
              <h1 className="font-bold text-sm uppercase">KEMENTERIAN AGAMA REPUBLIK INDONESIA</h1>
              <h1 className="font-bold text-sm uppercase">KANTOR KEMENTERIAN AGAMA KABUPATEN BANGGAI</h1>
              <h2 className="font-bold text-xl uppercase">MADRASAH ALIYAH NEGERI (MAN) BANGGAI</h2>
              <p className="text-[11px]">JL. Pulau Irian Rt.004 / Rw.006  Kel Kompo Kec. Luwuk Selatan 94717 NPSN 40209818 NSM 131172010001</p>
              <p className="text-[11px]">Website : https://man1banggai.sch.id /email :luwuk_man@yahoo.com</p>
            </div>

            <h3 className="text-center font-bold underline mb-6">SURAT PERNYATAAN KOMITMEN AKADEMIK</h3>

            <p className="mb-4">Saya yang bertanda tangan di bawah ini:</p>
            <table className="w-full mb-4">
              <tbody>
                <tr>
                  <td className="w-32">Nama Siswa</td>
                  <td>: {selectedStudent.nama}</td>
                </tr>
                <tr>
                  <td>Kelas</td>
                  <td>: {selectedStudent.kelas}</td>
                </tr>
                <tr>
                  <td>NIS</td>
                  <td>: {selectedStudent.nis}</td>
                </tr>
                <tr>
                  <td>Nama Orang Tua</td>
                  <td>: {selectedStudent.ortu || '-'}</td>
                </tr>
              </tbody>
            </table>

            <p className="mb-4 text-justify">
              Dengan ini menyatakan mengetahui bahwa nilai <strong>Rapor Digital Madrasah (RDM)</strong> Semester ini
              telah diisi sesuai standar <strong>Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)</strong>. Namun,
              berdasarkan fakta akademik, siswa tersebut masih memiliki belum tuntas pada mata pelajaran berikut:
            </p>

            <table className="w-full border-collapse border border-black mb-6">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black p-2 text-center w-12">No</th>
                  <th className="border border-black p-2">Mata Pelajaran</th>
                  <th className="border border-black p-2">Deskripsi Kekurangan/Kompetensi</th>
                </tr>
              </thead>
              <tbody>
                {pendingTasks.map((t, idx) => (
                  <tr key={t.id}>
                    <td className="border border-black p-2 text-center">{idx + 1}</td>
                    <td className="border border-black p-2">{t.mapel}</td>
                    <td className="border border-black p-2">{t.deskripsi}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mb-8 text-justify">
              Kami berkomitmen untuk menuntaskan kekurangan tersebut sesuai jadwal remedial yang ditetapkan. Kami
              bersedia apabila <strong>Rapor Fisik Asli ditahan sementara</strong> oleh pihak Madrasah sebagai jaminan
              hingga seluruh kompetensi dinyatakan tuntas.
            </p>

            <div className="flex justify-between mt-12">
              <div className="text-center">
                <p>Mengetahui,</p>
                <p>Orang Tua/Wali</p>
                <br />
                <br />
                <br />
                <p className="font-bold">({selectedStudent.ortu || '-'})</p>
              </div>
              <div className="text-center">
                <p>
                  Banggai,{' '}
                  {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p>Siswa</p>
                <br />
                <br />
                <br />
                <p className="font-bold">({selectedStudent.nama})</p>
              </div>
            </div>
            <div className="text-center mt-8">
              <p>Menyetujui,</p>
              <p>Wali Kelas {selectedStudent.kelas}</p>
              <br />
              <br />
              <p className="text-slate-400">.............................</p>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="p-4 bg-slate-50 rounded-b-xl flex justify-between items-center">
            <span className="text-xs text-slate-500 italic">File akan diunduh dalam format .doc (Microsoft Word)</span>
            <div className="flex gap-2">
              <button onClick={() => setShowPrintModal(false)} className="px-4 py-2 border rounded-lg hover:bg-slate-100">
                Tutup
              </button>
              <button
                className="px-4 py-2 bg-blue-800 text-white rounded-lg hover:bg-blue-900 flex items-center gap-2 shadow-lg"
                onClick={handleDownloadWord}
              >
                <FileText size={18} /> Cetak ke Word
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded text-white">
              <BookOpen size={20} />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight text-blue-900">SI-TUNTAS (MAN BANGGAI)</h1>
              <p className="text-xs text-slate-500">Kontrol Rapor & Remedial</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                void refreshData();
                void props.reloadProfile?.();
              }}
              className="px-3 py-1.5 border rounded-lg text-sm hover:bg-slate-50"
              title="Muat ulang data & role"
            >
              Refresh
            </button>
            <button
              onClick={() => void sb.auth.signOut()}
              className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700"
              title="Keluar"
            >
              Logout
            </button>
            <div className="text-right">
            {props.role && (
              <div className="text-xs text-slate-500">
                Role: <span className="font-semibold text-slate-700">{props.role}</span>
              </div>
            )}
            {props.userEmail && (
              <div className="text-xs text-slate-500">
                Email: <span className="font-semibold text-slate-700">{props.userEmail}</span>
              </div>
            )}
            {props.role === 'walikelas' && props.waliKelas && (
              <div className="text-xs text-slate-500">
                Wali Kelas: <span className="font-semibold text-slate-700">{props.waliKelas}</span>
              </div>
            )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {loadingData && (
          <div className="mb-4 bg-white border border-slate-200 rounded-lg p-4 text-sm text-slate-600">
            Memuat data dari Supabase...
          </div>
        )}
        {dataError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {dataError}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex space-x-1 mb-6 bg-slate-200 p-1 rounded-lg w-full md:w-auto inline-flex overflow-x-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === 'dashboard' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            Dashboard
          </button>
          {canManageStudents && (
            <button
              onClick={() => setActiveTab('students')}
              className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === 'students' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Data Siswa
            </button>
          )}
          {props.role === 'admin' && (
            <button
              onClick={() => setActiveTab('teachers')}
              className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === 'teachers' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Data Guru
            </button>
          )}
          <button
            onClick={() => setActiveTab('guru')}
            className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === 'guru' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            Input Guru Mapel
          </button>
          {canSeeWaliKelas && (
            <button
              onClick={() => setActiveTab('walikelas')}
              className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === 'walikelas'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Panel Wali Kelas
            </button>
          )}
        </div>

        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'students' && canManageStudents && <StudentsAdminView />}
        {activeTab === 'teachers' && <TeachersView />}
        {activeTab === 'guru' && <GuruView />}
        {activeTab === 'walikelas' && canSeeWaliKelas && <WaliKelasView />}
      </main>

      {/* Render Modals */}
      <AddTaskModal />
      <PrintPreviewModal />
      <StudentModal />
      <ImportStudentsModal />
    </div>
  );
}
