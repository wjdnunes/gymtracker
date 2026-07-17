// ============================================================
// supabase.config.example.js — TEMPLATE
// ============================================================
// Copie este arquivo para js/supabase.js e preencha com as
// credenciais do SEU projeto Supabase (Project Settings > API).
//
// A chave "anon" é segura para expor no client-side — a proteção
// real vem das políticas de Row Level Security (RLS) configuradas
// no banco. Nunca use a "service_role key" aqui.

const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_KEY = 'sua-anon-key-aqui';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    storage: window.localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// O restante de js/supabase.js (helpers de auth, showToast,
// calcular1RM, verificarPR) continua igual — só as credenciais
// acima mudam por ambiente.
